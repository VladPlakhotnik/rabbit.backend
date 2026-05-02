import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ClickerHistory } from './entities/clicker_history.entity'
import { ClickerHistoryService } from './clicker-history.service'

@Module({
  imports: [TypeOrmModule.forFeature([ClickerHistory])],
  providers: [ClickerHistoryService],
  exports: [ClickerHistoryService],
})
export class ClickerHistoryModule {}
