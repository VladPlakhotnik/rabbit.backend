import { Module } from '@nestjs/common'
import { PromoCodeModule } from '../promoCodes/promoCode.module'
import { RewardsModule } from '../rewards/rewards.module'
import { AdminBonusesController } from './admin-bonuses.controller'

@Module({
  imports: [PromoCodeModule, RewardsModule],
  controllers: [AdminBonusesController],
})
export class BonusesModule {}
