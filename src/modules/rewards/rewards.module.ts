import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RewardsController } from './rewards.controller'
import { RewardsService } from './rewards.service'
import { Reward } from './entities/rewards.entity'
import { RewardsCooldown } from './entities/rewardsCooldown.entity'

@Module({
  imports: [TypeOrmModule.forFeature([Reward, RewardsCooldown])],
  controllers: [RewardsController],
  providers: [RewardsService],
  exports: [RewardsService],
})
export class RewardsModule {}
