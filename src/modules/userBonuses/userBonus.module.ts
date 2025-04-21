// src/modules/userBonuses/user-bonus.module.ts
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { UserBonus } from './userBonus.entity'
import { UserBonusService } from './userBonus.service'

@Module({
  imports: [TypeOrmModule.forFeature([UserBonus])],
  providers: [UserBonusService],
  exports: [UserBonusService],
})
export class UserBonusModule {}
