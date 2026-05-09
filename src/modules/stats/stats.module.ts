import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { User } from '../users/user.entity'
import { CaseHistory } from '../userHistory/entities/case-history.entity'
import { UpgradeHistory } from '../userHistory/entities/upgrade-history.entity'
import { MinesSession } from '../mines/entities/mines-session.entity'
import { CrashSession } from '../crash/entities/crash-session.entity'
import { VipRewardClaim } from '../vip/vip-reward-claim.entity'
import { StatsService } from './stats.service'
import { StatsController } from './stats.controller'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      CaseHistory,
      UpgradeHistory,
      MinesSession,
      CrashSession,
      VipRewardClaim,
    ]),
  ],
  providers: [StatsService],
  controllers: [StatsController],
})
export class StatsModule {}
