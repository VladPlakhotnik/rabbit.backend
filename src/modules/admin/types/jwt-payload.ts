import { AdminRole } from './admin-role.enum'

// What we put inside the JWT.
//   sub:  admin id (uuid). Standard JWT claim — passport-jwt expects it.
//   role: snapshot at issue time. If role changes mid-session, old
//         tokens still hold the old role until they expire. That's the
//         tradeoff for stateless access tokens. Refresh re-reads from
//         DB, so role change takes effect within `accessTokenTtl`.
//   type: lets us reject access tokens at the refresh endpoint and
//         vice versa (defense in depth — the secret is also different).
//   jti:  unique per refresh token. Stored hashed in DB so we can mark
//         specific tokens as used / revoked. Not used on access tokens.
export interface AccessTokenPayload {
  sub: string
  role: AdminRole
  type: 'access'
}

export interface RefreshTokenPayload {
  sub: string
  type: 'refresh'
  jti: string
}

export type AdminJwtPayload = AccessTokenPayload | RefreshTokenPayload
