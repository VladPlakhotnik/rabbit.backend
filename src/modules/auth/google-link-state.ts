import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Request, Response } from 'express'
import { getRefreshSecret } from './auth-secrets'

// Google OAuth account-linking state cookie. Same structure as
// steam-link-state.ts (HMAC-SHA256 signed payload {user_id, nonce, exp}
// in an HttpOnly cookie scoped to /auth/google) — see that file for
// the rationale. Two reasons to keep them as separate modules instead
// of generalising:
//   • Cookie names differ (browser would otherwise serve the same
//     value to both endpoints), so the COOKIE_NAME has to be per
//     provider anyway.
//   • Path scoping differs (`/auth/steam` vs `/auth/google`), which
//     keeps each cookie out of the irrelevant callback's request set.
// A shared `signLinkState/verifyLinkState` plus per-provider thin
// wrappers would be 50 lines longer than the two parallel files for
// no readability win.

const COOKIE_NAME = 'google_link_state'
const COOKIE_PATH = '/auth/google'
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
 * Mints a fresh state, sets the cookie. Return value is exposed mostly
 * for tests — the cookie is the contract for the OAuth round-trip.
 */
export function setGoogleLinkStateCookie(res: Response, userId: number): string {
  const payload: StatePayload = {
    user_id: userId,
    nonce: randomBytes(16).toString('base64url'),
    exp: Math.floor((Date.now() + STATE_TTL_MS) / 1000),
  }
  const token = signState(payload)

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax', // 'strict' would drop the cookie on the Google→us return
    path: COOKIE_PATH,
    maxAge: STATE_TTL_MS,
  })

  return token
}

/**
 * Returns the user_id encoded in the state cookie, or null if the
 * cookie is missing, malformed, expired, or signed with the wrong key.
 */
export function readGoogleLinkStateCookie(req: Request): number | null {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies
  const value = cookies?.[COOKIE_NAME]
  if (typeof value !== 'string' || value.length === 0) return null
  const payload = verifyState(value)
  return payload ? payload.user_id : null
}

export function clearGoogleLinkStateCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: COOKIE_PATH })
}
