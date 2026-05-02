import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ClickerCritClickLevel } from './entities/clicker_crit_click_level.entity'
import { ClickerCritClickLevelsService } from './clicker-crit-click-levels.service'
import { ClickerCritClickLevelsController } from './clicker-crit-click-levels.controller'

@Module({
  imports: [TypeOrmModule.forFeature([ClickerCritClickLevel])],
  providers: [ClickerCritClickLevelsService],
  controllers: [ClickerCritClickLevelsController],
  exports: [ClickerCritClickLevelsService],
})
export class ClickerCritClickLevelsModule {}
