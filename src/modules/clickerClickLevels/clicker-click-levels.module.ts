import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ClickerClickLevel } from './entities/clicker_click_level.entity'
import { ClickerClickLevelsService } from './clicker-click-levels.service'
import { ClickerClickLevelsController } from './clicker-click-levels.controller'

@Module({
  imports: [TypeOrmModule.forFeature([ClickerClickLevel])],
  providers: [ClickerClickLevelsService],
  controllers: [ClickerClickLevelsController],
  exports: [ClickerClickLevelsService],
})
export class ClickerClickLevelsModule {}
