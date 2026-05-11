import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ClickerHistory } from './entities/clicker_history.entity'
import { ClickerHistoryService } from './clicker-history.service'
import { ClickerHistoryController } from './clicker-history.controller'

@Module({
  imports: [TypeOrmModule.forFeature([ClickerHistory])],
  providers: [ClickerHistoryService],
  controllers: [ClickerHistoryController],
  exports: [ClickerHistoryService],
})
export class ClickerHistoryModule {}
