// Shapes of JWT payloads issued for game-user auth. Mirrors the
// admin-side split (modules/admin/types/jwt-payload.ts) so the
// verification logic can later be hoisted into a shared layer.

// Access token payload. The OAuth-id fields are kept on the access
// token as a debugging crutch (logs include `steam_id` etc. so you
// can correlate without a DB hit) — they are not load-bearing for
// authorization, which goes by `sub` alone.
export interface AccessTokenPayload {
  sub: number
  steam_id?: number | string | null
  telegram_id?: number | string | null
  google_id?: string | null
  type: 'access'
  iat?: number
  exp?: number
}

// Refresh token payload. Only the user id and a per-row jti are on
// the wire — everything else (IP, UA, expiry) lives in the DB row
// keyed by bcrypt(jti). `type` is enforced on verify so an access
// token can never accidentally be accepted on /refresh.
export interface RefreshTokenPayload {
  sub: number
  jti: string
  type: 'refresh'
  iat?: number
  exp?: number
}

export type GameJwtPayload = AccessTokenPayload | RefreshTokenPayload
