// Helpers for redacting bearer tokens out of log lines.
//
// Mirrored — if you change this file, also update its twin in:
//   - bunny.frontend/src/shared/utils/mask-token.ts (when added)
//   - bunny-admin/src/shared/lib/mask-token.ts       (when added)
// (currently only the backend logs bearer tokens, so the helper is
//  only required here. Keep this comment if a frontend variant gets
//  added later so they stay in sync.)
//
// Rule: keep the scheme + last 4 characters as a correlation hint,
// drop everything else. Returns 'missing' for absent values and
// 'malformed' for inputs that don't look like `Scheme <token>`.

const TAIL_LEN = 4

export function maskAuthHeader(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return 'missing'

  const spaceIdx = value.indexOf(' ')
  if (spaceIdx <= 0) return 'malformed'

  const scheme = value.slice(0, spaceIdx)
  const token = value.slice(spaceIdx + 1).trim()

  if (token.length === 0) return `${scheme} <empty>`
  if (token.length <= TAIL_LEN * 2) return `${scheme} <redacted>`

  return `${scheme} …${token.slice(-TAIL_LEN)}`
}

// Field name → boolean: which keys of an HTTP headers object should
// be redacted before logging. Add to this list rather than special-
// casing in callers.
export const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
])

export function redactHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [name, raw] of Object.entries(headers)) {
    const lower = name.toLowerCase()
    const value = Array.isArray(raw) ? raw.join(', ') : (raw ?? '')
    out[name] = SENSITIVE_HEADER_NAMES.has(lower)
      ? maskAuthHeader(value)
      : value
  }
  return out
}
