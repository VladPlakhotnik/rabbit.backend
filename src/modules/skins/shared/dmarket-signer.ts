import nacl from 'tweetnacl'

// DMarket Trading API request signing — NaCl ed25519.
//
// Why this lives here, not inline in the per-game clients:
//   - The signing algorithm is identical for CSGO and Dota — only the
//     URL path differs. Putting it in one place keeps both clients
//     consistent if DMarket ever rotates the scheme.
//   - The previous implementation used HMAC-SHA256, which DMarket
//     silently accepts on read endpoints but doesn't recognize as a
//     valid auth — the request lands in the anonymous IP-based rate
//     limit bucket instead of the higher account-based one. ed25519
//     is the documented scheme; see the official reference at
//     https://github.com/dmarket/dm-trading-tools/blob/master/signature-builder/js/dmarketClient.js
//
// Canonical unsigned-string format (DMarket docs verbatim):
//   METHOD + (path with query string) + body + unix-timestamp-seconds
// No separators. For GET, body is the empty string.
//
// The signature header value is the literal prefix `dmar ed25519 `
// followed by the lowercase-hex of the 64-byte detached signature.
// Header keys are case-insensitive but DMarket's docs use exactly
// these capitalisations, so we mirror them.

const SIGNATURE_PREFIX = 'dmar ed25519 '
const ED25519_PUBLIC_KEY_HEX_LEN = 64
const ED25519_SECRET_KEY_HEX_LEN = 128
const HEX_PATTERN = /^[0-9a-f]+$/i

// Maximum age DMarket allows for the X-Sign-Date header — documented
// as 2 minutes. We always use the current wall clock for production
// signing, so this is informational; the constant exists so a future
// "validate signature locally" path can use the same number.
export const DMARKET_TIMESTAMP_MAX_AGE_SEC = 120

export interface DMarketAuthHeaders extends Record<string, string> {
  'X-Api-Key': string
  'X-Sign-Date': string
  'X-Request-Sign': string
  'Content-Type': string
}

export interface DMarketSigningInput {
  /** HTTP verb. Forced to upper-case before signing. */
  method: string
  /** Request path INCLUDING the query string (`/foo?bar=baz`). */
  pathWithQuery: string
  /** Request body for POST/PUT/PATCH. Empty string for GET. */
  body?: string
  /** 32-byte ed25519 public key, lowercase hex (64 chars). */
  publicKeyHex: string
  /** 64-byte ed25519 secret key, lowercase hex (128 chars). */
  secretKeyHex: string
  /**
   * Override for testing only. Production code lets the helper read
   * the wall clock — DMarket rejects timestamps older than 2 min, so
   * pinning it would only hurt.
   */
  timestampSec?: number
}

const decodeHex = (
  hex: string,
  expectedHexLen: number,
  fieldLabel: string,
): Uint8Array => {
  if (hex.length !== expectedHexLen) {
    // Don't include the actual key bytes in the error message — even
    // a malformed key shouldn't end up in logs that might get shipped
    // to a centralized aggregator.
    throw new Error(
      `DMarket ${fieldLabel}: expected ${expectedHexLen} hex chars, got ${hex.length}`,
    )
  }
  if (!HEX_PATTERN.test(hex)) {
    throw new Error(`DMarket ${fieldLabel}: must be a lowercase hex string`)
  }

  const out = new Uint8Array(expectedHexLen / 2)
  for (let i = 0, j = 0; i < hex.length; i += 2, j++) {
    out[j] = Number.parseInt(hex.substr(i, 2), 16)
  }
  return out
}

/**
 * Build the auth headers for a DMarket Trading API request. Throws if
 * the keys are malformed (wrong length, non-hex chars) — callers
 * shouldn't need to handle the error directly because the env-validation
 * step at startup already guarantees well-formed values; this is a
 * defence-in-depth check.
 */
export const signDMarketRequest = (
  input: DMarketSigningInput,
): DMarketAuthHeaders => {
  const { method, pathWithQuery, body = '', publicKeyHex, secretKeyHex } = input

  if (publicKeyHex.length !== ED25519_PUBLIC_KEY_HEX_LEN) {
    throw new Error(
      `DMarket public key: expected ${ED25519_PUBLIC_KEY_HEX_LEN} hex chars, got ${publicKeyHex.length}`,
    )
  }
  if (!HEX_PATTERN.test(publicKeyHex)) {
    throw new Error('DMarket public key: must be a lowercase hex string')
  }

  const secretKeyBytes = decodeHex(
    secretKeyHex,
    ED25519_SECRET_KEY_HEX_LEN,
    'secret key',
  )

  const timestampSec = input.timestampSec ?? Math.floor(Date.now() / 1000)
  const stringToSign =
    method.toUpperCase() + pathWithQuery + body + timestampSec

  // tweetnacl expects the secret key as a Uint8Array with the standard
  // 64-byte ed25519 layout (32-byte seed + 32-byte public key). Our
  // decodeHex enforces that length already.
  const signatureBytes = nacl.sign.detached(
    Buffer.from(stringToSign, 'utf-8'),
    secretKeyBytes,
  )

  return {
    'X-Api-Key': publicKeyHex,
    'X-Sign-Date': String(timestampSec),
    'X-Request-Sign':
      SIGNATURE_PREFIX + Buffer.from(signatureBytes).toString('hex'),
    'Content-Type': 'application/json',
  }
}

// ---- Rate-limit observation ---------------------------------------
//
// DMarket returns rate-limit metadata in response headers (per their
// FAQ — exact header names aren't documented, so we collect anything
// that looks like one). We log the first observation per game label
// so the operator can see, on every fresh process, what bucket the
// account actually got placed in. After that we stay quiet.

const rateLimitLogged = new Set<string>()

const RATE_LIMIT_HEADER_PATTERN = /^(x-rate-?limit|retry-after)/i

export interface RateLimitObservation {
  headersLogged: boolean
  noHeadersFound: boolean
}

/**
 * Log once-per-process the DMarket rate-limit headers from a successful
 * response. Returns whether anything was logged so the caller can
 * surface "we're authenticated correctly" / "still anon" diagnostics
 * if needed.
 *
 * The `label` distinguishes between game-scoped clients ('csgo' vs
 * 'dota') so each gets its own one-shot log — the rate limit might
 * be different per endpoint family.
 */
export const observeRateLimitHeaders = (
  label: string,
  headers: Record<string, unknown> | undefined,
  log: (msg: string) => void,
): RateLimitObservation => {
  if (rateLimitLogged.has(label)) {
    return { headersLogged: false, noHeadersFound: false }
  }

  if (!headers) {
    return { headersLogged: false, noHeadersFound: true }
  }

  const relevant: string[] = []
  for (const [key, value] of Object.entries(headers)) {
    if (RATE_LIMIT_HEADER_PATTERN.test(key)) {
      relevant.push(`${key}=${String(value)}`)
    }
  }

  rateLimitLogged.add(label)

  if (relevant.length === 0) {
    log(
      `[${label}] DMarket returned no rate-limit headers on the first response — ` +
        `either we're still in the anon bucket or DMarket simply isn't sending them.`,
    )
    return { headersLogged: false, noHeadersFound: true }
  }

  log(`[${label}] DMarket rate-limit headers (first response): ${relevant.join(' ')}`)
  return { headersLogged: true, noHeadersFound: false }
}

/**
 * Reset the once-per-process logging state. For tests only — do not
 * call from runtime code.
 */
export const __resetRateLimitObserver = (): void => {
  rateLimitLogged.clear()
}
