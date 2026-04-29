import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RewardsController } from './rewards.controller'
import { RewardsService } from './rewards.service'
import { Reward } from './entities/rewards.entity'
import { RewardsCooldown } from './entities/rewardsCooldown.entity'
import { UserBonusModule } from '../userBonuses/userBonus.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([Reward, RewardsCooldown]),
    UserBonusModule,
  ],
  controllers: [RewardsController],
  providers: [RewardsService],
  exports: [RewardsService],
})
export class RewardsModule {}
