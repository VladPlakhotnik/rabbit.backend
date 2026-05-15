import { Global, Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { ThrottlerModule } from '@nestjs/throttler'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AdminAuthController } from './controllers/admin-auth.controller'
import { AdminAnalyticsController } from './controllers/admin-analytics.controller'
import { AdminSecurityController } from './controllers/admin-security.controller'
import { AdminController } from './controllers/admin.controller'
import { AdminSessionsController } from './controllers/admin-sessions.controller'
import { AdminTotpController } from './controllers/admin-totp.controller'
import { MeController } from './controllers/me.controller'
import { AdminRefreshToken } from './entities/admin-refresh-token.entity'
import { AdminSecurityEvent } from './entities/admin-security-event.entity'
import { Admin } from './entities/admin.entity'
import { AdminAuthService } from './services/admin-auth.service'
import { AdminAnalyticsService } from './services/admin-analytics.service'
import { AdminSecurityEventService } from './services/admin-security-event.service'
import { AdminService } from './services/admin.service'
import { AdminTotpService } from './services/admin-totp.service'
import { AdminJwtStrategy } from './strategies/admin-jwt.strategy'

// Self-contained module. Brings its own JwtModule (separate secrets
// from any other auth flow), its own ThrottlerModule (login rate
// limit), passport with the 'admin-jwt' strategy.
//
// Marked @Global so AdminJwtGuard / AdminRolesGuard / AdminAuthService
// can be used in any other controller (e.g. CaseController) without
// re-importing the module everywhere. Game-user auth flows live in
// AuthModule and use AuthGuard('jwt') from @nestjs/passport directly.
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Admin, AdminRefreshToken, AdminSecurityEvent]),
    PassportModule.register({ defaultStrategy: 'admin-jwt' }),
    // JwtModule is registered without a default secret — secrets are
    // passed explicitly to sign/verify in AdminAuthService so we can
    // use different keys for access vs refresh tokens.
    JwtModule.register({}),
    // Default throttle: 100 reqs / 60s — overridden per-route via
    // @Throttle({ default: { limit: N, ttl: ms } }) in controllers.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
  ],
  controllers: [
    AdminAuthController,
    AdminAnalyticsController,
    AdminSecurityController,
    AdminTotpController,
    AdminSessionsController,
    AdminController,
    MeController,
  ],
  providers: [
    AdminAuthService,
    AdminAnalyticsService,
    AdminSecurityEventService,
    AdminService,
    AdminTotpService,
    AdminJwtStrategy,
  ],
  exports: [AdminAuthService, ThrottlerModule],
})
export class AdminModule {}
