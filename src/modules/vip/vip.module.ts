import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { User } from '../users/user.entity'
import { NotificationModule } from '../notifications/notification.module'
import { AdminVipController } from './admin-vip.controller'
import { AdminVipService } from './admin-vip.service'
import { VipController } from './vip.controller'
import { VipLedger } from './vip-ledger.entity'
import { VipRewardClaim } from './vip-reward-claim.entity'
import { VipRewardsService } from './vip-rewards.service'
import { VipService } from './vip.service'

@Module({
  imports: [
    NotificationModule,
    TypeOrmModule.forFeature([User, VipLedger, VipRewardClaim]),
  ],
  controllers: [VipController, AdminVipController],
  providers: [VipService, VipRewardsService, AdminVipService],
  exports: [VipService, VipRewardsService],
})
export class VipModule {}
