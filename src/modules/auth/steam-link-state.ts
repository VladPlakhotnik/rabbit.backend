import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Request, Response } from 'express'
import { getRefreshSecret } from './auth-secrets'

// Steam OpenID has no per-request authentication context — by the time
// the user comes back from steamcommunity.com, we've lost the original
// JWT. Account-linking therefore needs a server-issued state cookie
// that ties the round-trip to a specific user_id, signed so the user
// can't tamper with it.
//
// The state contains: user_id, nonce, exp (unix seconds). It's HMAC-SHA256
// signed with the JWT refresh secret (already required, already kept
// secret) and base64url-encoded, then stuffed into an HttpOnly cookie
// scoped to /auth/steam so it isn't shipped on every API request.
//
// Lifetime: 5 minutes. The Steam round-trip almost never takes more
// than ~30 s; 5 min is a comfortable upper bound that survives a slow
// WiFi blip without ever opening a real attack window.

const COOKIE_NAME = 'steam_link_state'
const COOKIE_PATH = '/auth/steam'
const STATE_TTL_MS = 5 * 60 * 1000

interface StatePayload {
  user_id: number
  nonce: string
  exp: number
}

const isProduction = (): boolean =>
  (process.env.NODE_ENV ?? '').toLowerCase() === 'production'

function signState(payload: StatePayload): string {
  const json = JSON.stringify(payload)
  const body = Buffer.from(json, 'utf8').toString('base64url')
  const sig = createHmac('sha256', getRefreshSecret()).update(body).digest('base64url')
  return `${body}.${sig}`
}

function verifyState(token: string): StatePayload | null {
  const dot = token.indexOf('.')
  if (dot <= 0) return null

  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)

  const expected = createHmac('sha256', getRefreshSecret()).update(body).digest('base64url')
  // timingSafeEqual is constant-time only when buffers have equal byte
  // length — guard against length-mismatch first to avoid throwing.
  if (sig.length !== expected.length) return null

  const sigBuf = Buffer.from(sig, 'utf8')
  const expectedBuf = Buffer.from(expected, 'utf8')
  if (!timingSafeEqual(sigBuf, expectedBuf)) return null

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StatePayload
    if (typeof payload.user_id !== 'number' || typeof payload.exp !== 'number') return null
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

/**
 * Mints a fresh state, sets the cookie, returns the value (rarely
 * needed by callers — the cookie is the contract; the return value
 * is exposed mostly for tests).
 */
export function setSteamLinkStateCookie(res: Response, userId: number): string {
  const payload: StatePayload = {
    user_id: userId,
    nonce: randomBytes(16).toString('base64url'),
    exp: Math.floor((Date.now() + STATE_TTL_MS) / 1000),
  }
  const token = signState(payload)

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax', // 'strict' would drop the cookie on the Steam→us return
    path: COOKIE_PATH,
    maxAge: STATE_TTL_MS,
  })

  return token
}

/**
 * Returns the user_id encoded in the state cookie, or null if the
 * cookie is missing, malformed, expired, or signed with the wrong key.
 */
export function readSteamLinkStateCookie(req: Request): number | null {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies
  const value = cookies?.[COOKIE_NAME]
  if (typeof value !== 'string' || value.length === 0) return null
  const payload = verifyState(value)
  return payload ? payload.user_id : null
}

export function clearSteamLinkStateCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: COOKIE_PATH })
}
