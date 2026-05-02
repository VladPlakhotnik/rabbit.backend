import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ClickerAutoClickerLevel } from './entities/clicker_auto_clicker_level.entity'
import { ClickerAutoClickerLevelsService } from './clicker-auto-clicker-levels.service'
import { ClickerAutoClickerLevelsController } from './clicker-auto-clicker-levels.controller'

@Module({
  imports: [TypeOrmModule.forFeature([ClickerAutoClickerLevel])],
  providers: [ClickerAutoClickerLevelsService],
  controllers: [ClickerAutoClickerLevelsController],
  exports: [ClickerAutoClickerLevelsService],
})
export class ClickerAutoClickerLevelsModule {}
