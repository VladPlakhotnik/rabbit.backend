import type { Response, Request } from 'express'

// Game-user refresh-token cookie. HttpOnly so XSS can't read it,
// SameSite=lax so it survives the OAuth provider redirect (strict
// would drop the cookie when the browser comes back from steam/google),
// Path=/auth so it isn't sent on every API request.
export const USER_REFRESH_COOKIE = 'user_rt'
export const USER_REFRESH_COOKIE_PATH = '/auth'

// 7d, mirrors REFRESH_TOKEN_EXPIRES on the JWT side. Kept as ms to
// match Express cookie API.
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

const isProduction = (): boolean =>
  (process.env.NODE_ENV ?? '').toLowerCase() === 'production'

export function setUserRefreshCookie(res: Response, refreshToken: string): void {
  res.cookie(USER_REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: USER_REFRESH_COOKIE_PATH,
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  })
}

export function clearUserRefreshCookie(res: Response): void {
  res.clearCookie(USER_REFRESH_COOKIE, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: USER_REFRESH_COOKIE_PATH,
  })
}

export function readUserRefreshCookie(req: Request): string | null {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies
  const value = cookies?.[USER_REFRESH_COOKIE]
  return typeof value === 'string' && value.length > 0 ? value : null
}
