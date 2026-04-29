import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { User } from '../users/user.entity'
import { CaseHistory } from '../userHistory/entities/case-history.entity'
import { UpgradeHistory } from '../userHistory/entities/upgrade-history.entity'
import { StatsService } from './stats.service'
import { StatsController } from './stats.controller'

@Module({
  imports: [TypeOrmModule.forFeature([User, CaseHistory, UpgradeHistory])],
  providers: [StatsService],
  controllers: [StatsController],
})
export class StatsModule {}
