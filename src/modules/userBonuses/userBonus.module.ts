// src/modules/userBonuses/user-bonus.module.ts
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { UserBonus } from './userBonus.entity'
import { UserBonusService } from './userBonus.service'
import { UserBonusController } from './userBonus.controller'
import { RewardsCooldown } from '../rewards/entities/rewardsCooldown.entity'
import { User } from '../users/user.entity'
import { ClickerUserModule } from '../clickerUser/clicker-user.module'
import { UserInventoryModule } from '../userInventory/userInventory.module'
import { CaseModule } from '../cases/case.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([RewardsCooldown, User, UserBonus]),
    ClickerUserModule,
    UserInventoryModule,
    CaseModule,
  ],
  providers: [UserBonusService],
  controllers: [UserBonusController],
  exports: [UserBonusService],
})
export class UserBonusModule {}
