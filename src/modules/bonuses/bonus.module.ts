import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BonusController } from './bonus.controller'
import { BonusService } from './services/bonus.service'
import { Reward } from './entities/rewards.entity'
import { UserSpinCooldown } from './entities/userSpinCooldown.entity'

@Module({
  imports: [TypeOrmModule.forFeature([Reward, UserSpinCooldown])],
  controllers: [BonusController],
  providers: [BonusService],
  exports: [BonusService],
})
export class BonusModule {}
