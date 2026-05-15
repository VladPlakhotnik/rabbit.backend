// Sensible local-dev defaults. Covers the common Vite ports plus the HTTPS
// modes (`yarn dev:https` → 3443, `yarn dev:https:443` → 443). LAN-IP
// origins (192.168.x.x) are user-specific, so they must be added via the
// CORS_ORIGINS env variable rather than hardcoded here.
//
// On staging/prod, set CORS_ORIGINS explicitly to your real domain(s).
const DEFAULT_DEV_ORIGINS = [
  // HTTP (yarn dev)
  'http://localhost:3000', // burrow-ui docs
  'http://localhost:5000', // backend (self)
  'http://localhost:5173', // bunny.frontend
  'http://localhost:7173', // bunny-admin dev
  'http://localhost:7174', // bunny-admin preview
  'http://127.0.0.1:5173', // Vite printed local URL
  'http://127.0.0.1:7173', // bunny-admin dev via loopback
  'http://127.0.0.1:7174', // bunny-admin preview via loopback
  // HTTPS (yarn dev:https / dev:https:443). Browsers omit the port when
  // it's the default (443), so we keep both forms to be safe across UAs.
  'https://localhost',
  'https://localhost:443',
  'https://localhost:3443',
  'https://localhost:5173',
]

/**
 * Comma-separated list of allowed origins for both REST and WebSocket.
 * Falls back to dev defaults if unset — keeps local development frictionless
 * while forcing an explicit allowlist in any deployed environment.
 */
export function getCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS?.trim()
  if (!raw) return DEFAULT_DEV_ORIGINS
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}
