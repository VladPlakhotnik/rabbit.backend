import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ClickerEnergyLevel } from './entities/clicker_energy_level.entity'
import { ClickerEnergyLevelsService } from './clicker-energy-levels.service'
import { ClickerEnergyLevelsController } from './clicker-energy-levels.controller'

@Module({
  imports: [TypeOrmModule.forFeature([ClickerEnergyLevel])],
  providers: [ClickerEnergyLevelsService],
  controllers: [ClickerEnergyLevelsController],
  exports: [ClickerEnergyLevelsService],
})
export class ClickerEnergyLevelsModule {}
