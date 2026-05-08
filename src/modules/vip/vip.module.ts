import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { User } from '../users/user.entity'
import { VipController } from './vip.controller'
import { VipLedger } from './vip-ledger.entity'
import { VipRewardClaim } from './vip-reward-claim.entity'
import { VipRewardsService } from './vip-rewards.service'
import { VipService } from './vip.service'

@Module({
  imports: [TypeOrmModule.forFeature([User, VipLedger, VipRewardClaim])],
  controllers: [VipController],
  providers: [VipService, VipRewardsService],
  exports: [VipService, VipRewardsService],
})
export class VipModule {}
