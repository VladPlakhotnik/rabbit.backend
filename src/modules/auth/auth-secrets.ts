// Game-user JWT secrets. Access and refresh are signed with separate
// keys so that a leak of one (e.g. the access secret used by every
// verifier) doesn't also let an attacker mint long-lived refresh
// tokens.
//
// The legacy single-secret fallback (`JWT_SECRET`) was removed once
// production was migrated. Both env vars are now required at boot.
// Generate them with:
//   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
// (run twice, store separately).

export function getAccessSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET
  if (!secret) {
    throw new Error('JWT_ACCESS_SECRET is not defined')
  }
  return secret
}

export function getRefreshSecret(): string {
  const secret = process.env.JWT_REFRESH_SECRET
  if (!secret) {
    throw new Error('JWT_REFRESH_SECRET is not defined')
  }
  return secret
}
