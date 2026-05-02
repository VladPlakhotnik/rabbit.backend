// src/modules/userBonuses/user-bonus.module.ts
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { UserBonus } from './userBonus.entity'
import { UserBonusService } from './userBonus.service'
import { UserBonusController } from './userBonus.controller'

@Module({
  imports: [TypeOrmModule.forFeature([UserBonus])],
  providers: [UserBonusService],
  controllers: [UserBonusController],
  exports: [UserBonusService],
})
export class UserBonusModule {}
