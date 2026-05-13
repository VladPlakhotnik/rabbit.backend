// Centralised access to admin-auth env vars + sensible defaults.
// Validated lazily — values are read each time so tests can stub
// process.env. In production you should set everything explicitly.

const requireEnv = (key: string): string => {
  const value = process.env[key]
  if (!value || value.trim() === '') {
    throw new Error(`Missing required env var: ${key}`)
  }
  return value.trim()
}

// Bcrypt cost — 12 is the OWASP-recommended minimum (≈250ms / hash on
// modern hardware). Bumpable later via env without code change.
export const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 12)

// Token TTLs. Short access + long refresh is the standard pattern.
export const ACCESS_TOKEN_TTL_SECONDS = Number(
  process.env.ADMIN_ACCESS_TOKEN_TTL_SECONDS ?? 15 * 60, // 15 min
)
export const REFRESH_TOKEN_TTL_SECONDS = Number(
  process.env.ADMIN_REFRESH_TOKEN_TTL_SECONDS ?? 7 * 24 * 60 * 60, // 7 days
)

// Lockout policy — 5 failed attempts → block for 15 minutes.
// Counter resets on a successful login or after the lockout expires.
export const MAX_FAILED_LOGIN_ATTEMPTS = Number(
  process.env.ADMIN_MAX_FAILED_LOGIN_ATTEMPTS ?? 5,
)
export const LOCKOUT_DURATION_MS = Number(
  process.env.ADMIN_LOCKOUT_DURATION_MS ?? 15 * 60 * 1000, // 15 min
)

export const COOKIE_NAME = process.env.ADMIN_REFRESH_COOKIE_NAME ?? 'admin_rt'

// Cookie path scopes the refresh cookie to the refresh + logout
// endpoints only. Browser then doesn't send it on every other request,
// reducing exposure.
export const COOKIE_PATH = '/admin/auth'

// Production-only flags; dev needs Secure off because localhost is HTTP.
export const isProduction = (): boolean => process.env.NODE_ENV === 'production'

// JWT secrets — separate access + refresh secrets so a leak of one
// doesn't compromise the other family. Throws at first use if unset.
export const getJwtAccessSecret = (): string =>
  requireEnv('ADMIN_JWT_ACCESS_SECRET')
export const getJwtRefreshSecret = (): string =>
  requireEnv('ADMIN_JWT_REFRESH_SECRET')

// Optional bootstrap — set both when seeding the very first super_admin
// on a fresh DB. After the first successful boot, remove these env vars
// (or keep them; they're a no-op once any admin exists).
export const getInitialAdminEmail = (): string | null =>
  process.env.ADMIN_INITIAL_EMAIL?.trim() || null
export const getInitialAdminPassword = (): string | null =>
  process.env.ADMIN_INITIAL_PASSWORD?.trim() || null
