import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'
import { JwtModule } from '@nestjs/jwt'
import { ConfigModule } from '@nestjs/config'
import { CacheModule } from '@nestjs/cache-manager'
import { ThrottlerModule } from '@nestjs/throttler'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { JwtStrategy } from './jwt.strategy'
import { JwtUserCacheSubscriber } from './jwt-user-cache.subscriber'
import { SteamStrategy } from './steam.strategy'
import { TelegramStrategy } from './telegram.strategy'
import { GoogleStrategy } from './google.strategy'
import { UserModule } from '../users/users.module'
import { SocialModule } from '../social/social.module'
import { getAccessSecret } from './auth-secrets'
import { UserRefreshToken } from './entities/user-refresh-token.entity'

@Module({
  imports: [
    ConfigModule.forRoot({
      validate: config => {
        // Both secrets are mandatory. Generate with:
        //   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
        if (!config.JWT_ACCESS_SECRET || !config.JWT_REFRESH_SECRET) {
          throw new Error(
            'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET are both required',
          )
        }
        if (config.JWT_ACCESS_SECRET === config.JWT_REFRESH_SECRET) {
          // Same value defeats the whole point of splitting them — the
          // refresh-only verifier path would also accept access tokens
          // (and vice versa) without realising it.
          throw new Error(
            'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different values',
          )
        }
        return config
      },
    }),
    PassportModule,
    // Default secret is the access secret — used by JwtService.sign() when
    // no explicit `secret` option is passed. Refresh tokens are signed
    // with an explicit override (see AuthService.login) so a leak of the
    // access secret can't be used to mint refresh tokens.
    JwtModule.register({
      secret: getAccessSecret(),
    }),
    UserModule,
    SocialModule,
    TypeOrmModule.forFeature([UserRefreshToken]),
    // Global so other modules (UserService) can inject CACHE_MANAGER
     // without re-registering — that would give them a separate cache
     // instance and JwtStrategy invalidations would never reach them.
     CacheModule.register({
       ttl: 300, // 5 minutes
       max: 100, // 100 requests
       isGlobal: true,
     }),
    // Per-controller throttling for OAuth callbacks, /auth/refresh and
    // telegram link/miniapp endpoints. Specific limits live as
    // @Throttle({ default: { limit, ttl } }) on the handlers themselves.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    SteamStrategy,
    TelegramStrategy,
    GoogleStrategy,
    // Self-registers via DataSource on construction — no decorator
    // setup needed in TypeOrmModule.forRoot. See class-level comment
    // for why we don't use the @EventSubscriber() route.
    JwtUserCacheSubscriber,
  ],
})
export class AuthModule {}
