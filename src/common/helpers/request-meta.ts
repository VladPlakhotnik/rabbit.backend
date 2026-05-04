import type { Request } from 'express'

// Resolve the originating client IP. We prefer X-Forwarded-For when
// running behind a trusted proxy (Fly's edge, our nginx, etc.); the
// raw req.ip / socket.remoteAddress is the fallback for direct hits
// in dev. Capped at the first hop because an attacker can append
// arbitrary entries to X-Forwarded-For client-side.
export function getClientIp(req: Request): string | null {
  const fwd = req.headers['x-forwarded-for']
  if (typeof fwd === 'string') {
    const first = fwd.split(',')[0]?.trim()
    if (first) return first
  }
  return req.ip ?? req.socket?.remoteAddress ?? null
}

// Truncate the UA at 500 to match the column width on
// admin_refresh_tokens / user_refresh_tokens. Anything longer is
// almost certainly junk anyway.
export function getUserAgent(req: Request): string | null {
  const ua = req.headers['user-agent']
  return typeof ua === 'string' ? ua.slice(0, 500) : null
}
