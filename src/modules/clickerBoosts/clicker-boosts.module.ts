import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ClickerUserModule } from '../clickerUser/clicker-user.module'
import { ClickerHistoryModule } from '../clickerHistory/clicker-history.module'
import { ClickerBoost } from './entities/clicker_boost.entity'
import { ClickerUserBoost } from './entities/clicker_user_boost.entity'
import { ClickerBoostsService } from './clicker-boosts.service'
import { ClickerBoostsController } from './clicker-boosts.controller'

/**
 * Imports ClickerUserModule so we can reach into ClickerFlushService /
 * ClickerRedisService for the buy flow without re-instantiating them
 * here. The user module already exports those providers.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ClickerBoost, ClickerUserBoost]),
    ClickerUserModule,
    ClickerHistoryModule,
  ],
  providers: [ClickerBoostsService],
  controllers: [ClickerBoostsController],
  exports: [ClickerBoostsService, TypeOrmModule],
})
export class ClickerBoostsModule {}
