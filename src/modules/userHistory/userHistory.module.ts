import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { UserHistory } from './userHistory.entity'
import { CaseHistory } from './entities/case-history.entity'
import { UpgradeHistory } from './entities/upgrade-history.entity'
import { UserHistoryService } from './userHistory.service'
import { UserHistoryController } from './userHistory.controller'

@Module({
  imports: [
    TypeOrmModule.forFeature([UserHistory, CaseHistory, UpgradeHistory]),
  ],
  providers: [UserHistoryService],
  controllers: [UserHistoryController],
  exports: [UserHistoryService],
})
export class UserHistoryModule {}
