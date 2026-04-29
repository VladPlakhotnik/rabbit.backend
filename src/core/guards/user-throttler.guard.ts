import { Injectable } from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'

/**
 * Throttle by authenticated `user.id` when present, fall back to IP for
 * anonymous requests.
 *
 * Default ThrottlerGuard counts every request from the same IP into one
 * shared bucket — that's the wrong unit at NAT boundaries (school
 * Wi-Fi, corporate networks, mobile carriers behind CGNAT). Two users on
 * the same physical IP would steal each other's quota and trigger 429s
 * on legitimate traffic.
 *
 * Authenticated routes know who's calling — JWT auth runs before this
 * guard and sets `req.user`. Routes mounted without an auth guard still
 * fall through to the IP-based behaviour, so the change is safe to apply
 * blanket-style to controllers that mix protected and public methods.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, any>): Promise<string> {
    const userId = req.user?.id
    if (typeof userId === 'number') {
      return Promise.resolve(`user:${userId}`)
    }
    // Express normalises the proxied IP into req.ip via the trust-proxy
    // setting (Heroku's X-Forwarded-For is honoured automatically).
    const ip = typeof req.ip === 'string' ? req.ip : 'unknown'
    return Promise.resolve(`ip:${ip}`)
  }
}
