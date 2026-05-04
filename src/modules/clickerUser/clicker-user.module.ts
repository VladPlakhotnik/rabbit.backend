import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { JwtModule } from '@nestjs/jwt'
import { ClickerUser } from './entities/clicker_user.entity'
import { getAccessSecret } from '../auth/auth-secrets'
import { ClickerUserController } from './clicker-user.controller'
import { ClickerUserService } from './clicker-user.service'
import { ClickerLevelsModule } from '../clickerLevels/clicker-levels.module'
import { ClickerUserGateway } from './clicker-user.gateway'
import { ClickerClickLevelsModule } from '../clickerClickLevels/clicker-click-levels.module'
import { ClickerEnergyLevelsModule } from '../clickerEnergyLevels/clicker-energy-levels.module'
import { ClickerAutoClickerLevel } from '../clickerAutoClickerLevels/entities/clicker_auto_clicker_level.entity'
import { ClickerCritClickLevel } from '../clickerCritClickLevels/entities/clicker_crit_click_level.entity'
import { ClickerHistoryModule } from '../clickerHistory/clicker-history.module'
import { ClickerRedisService } from './redis/clicker-redis.service'
import { ClickerFlushService } from './redis/clicker-flush.service'
import { ClickerLevelsCacheService } from './services/clicker-levels-cache.service'
import { ClickerEngineService } from './services/clicker-engine.service'
import { ClickerMetricsService } from './services/clicker-metrics.service'

@Module({
  imports: [
    // ClickerAutoClickerLevel / ClickerCritClickLevel registered here
    // (in addition to their own modules) so the upgradeSkill flow can
    // run findOne against them inside its DataSource.transaction
    // without bouncing through another service.
    TypeOrmModule.forFeature([
      ClickerUser,
      ClickerAutoClickerLevel,
      ClickerCritClickLevel,
    ]),
    ClickerLevelsModule,
    ClickerClickLevelsModule,
    ClickerEnergyLevelsModule,
    ClickerHistoryModule,
    // Local JwtModule (mirrors notifications module). Used by the gateway
    // to verify the access token passed in the websocket handshake. Must
    // use the access secret since the WS client supplies its short-lived
    // bearer.
    JwtModule.register({
      secret: getAccessSecret(),
    }),
  ],
  providers: [
    ClickerRedisService,
    ClickerFlushService,
    ClickerLevelsCacheService,
    ClickerMetricsService,
    ClickerEngineService,
    ClickerUserService,
    ClickerUserGateway,
  ],
  controllers: [ClickerUserController],
  // ClickerFlushService + ClickerRedisService are re-exported so
  // sibling modules (ClickerBoosts, ClickerCases) can lock against
  // the user's points balance without rewiring TypeORM repositories
  // or duplicating the singleton.
  exports: [
    ClickerUserService,
    ClickerFlushService,
    ClickerRedisService,
    ClickerLevelsCacheService,
    ClickerMetricsService,
  ],
})
export class ClickerUserModule {}
