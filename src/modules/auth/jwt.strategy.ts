import { Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import type { Cache } from 'cache-manager'
import { PassportStrategy } from '@nestjs/passport'
import { Strategy, ExtractJwt } from 'passport-jwt'
import { UserService } from '../users/users.service'
import type { JwtPayload } from './auth.service'
import { User } from '../users/user.entity'
import { ERROR_MESSAGES } from '../../constants/errorMessages'
import { getAccessSecret } from './auth-secrets'
import { jwtUserCacheKey } from './jwt-user-cache-key'

// Window during which a positive JWT lookup is served from the in-process
// cache. Trade-off: a user blocked or role-changed by an admin still gets
// served from cache for up to TTL ms. We accept that — game-user roles
// and active flags don't change often, and admin-panel actions can wait
// 30 s to take effect. If you ever need immediate revocation, invalidate
// `jwt:user:<id>` after the mutation instead of dropping this cache.
const JWT_USER_CACHE_TTL_MS = 30_000

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly userService: UserService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getAccessSecret(),
    })
  }

  async validate(payload: JwtPayload): Promise<User> {
    const userId =
      typeof payload.sub === 'string' ? parseInt(payload.sub, 10) : payload.sub

    if (isNaN(userId) || userId <= 0) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.INVALID_TOKEN)
    }

    // We used to also require at least one of steam_id / telegram_id /
    // google_id to be present in the payload as a "sanity check" that
    // the token came from a real OAuth flow. Removed: refresh-rotation
    // issues access tokens with only `sub` + `type` (no OAuth ids), so
    // the check rejected every refreshed token. Authentication now
    // relies purely on signature validity + sub → DB lookup, which is
    // the standard JWT pattern.
    const cacheKey = jwtUserCacheKey(userId)
    const cached = await this.cache.get<User>(cacheKey)
    if (cached) return cached

    const user = await this.userService.findById(userId)
    if (!user) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.NOT_AUTHENTICATED)
    }

    // Negative results aren't cached — a deleted user must produce 401
    // immediately on the next request (no caching of the throw path).
    await this.cache.set(cacheKey, user, JWT_USER_CACHE_TTL_MS)
    return user
  }
}
