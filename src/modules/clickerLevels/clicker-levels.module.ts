import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ClickerLevel } from './entities/clicker_level.entity'
import { ClickerLevelsService } from './clicker-levels.service'
import { ClickerLevelsController } from './clicker-levels.controller'

@Module({
  imports: [TypeOrmModule.forFeature([ClickerLevel])],
  providers: [ClickerLevelsService],
  controllers: [ClickerLevelsController],
  exports: [ClickerLevelsService],
})
export class ClickerLevelsModule {}
