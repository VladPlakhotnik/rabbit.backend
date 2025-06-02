import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ClickerUser } from './entities/clicker_user.entity'
import { ClickerUserController } from './clicker-user.controller'
import { ClickerUserService } from './clicker-user.service'
import { ClickerLevelsModule } from '../clickerLevels/clicker-levels.module'
import { ClickerUserGateway } from './clicker-user.gateway'
import { ClickerClickLevelsModule } from '../clickerClickLevels/clicker-click-levels.module'
import { ClickerEnergyLevelsModule } from '../clickerEnergyLevels/clicker-energy-levels.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([ClickerUser]),
    ClickerLevelsModule,
    ClickerClickLevelsModule,
    ClickerEnergyLevelsModule,
  ],
  providers: [ClickerUserService, ClickerUserGateway],
  controllers: [ClickerUserController],
  exports: [ClickerUserService],
})
export class ClickerUserModule {}
