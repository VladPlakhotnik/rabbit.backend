import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { User } from './user.entity'
import { UserService } from './users.service'
import { UserController } from './users.controller'
import { UserInventory } from '../userInventory/userInventory.entity'
import { Skin } from '../skins/skin.entity'
import { Case } from '../cases/case.entity'
import { SkinCase } from '../skinCase/skinCase.entity'
import { Bonus } from '../bonuses/bonus.entity'
import { Notification } from '../notifications/notification.entity'
import { PromoCode } from '../promoCodes/promoCode.entity'
import { PromoCodeBonus } from '../promoCodeBonuses/promoCodeBonus.entity'
import { PromoCodeDeposit } from '../promoCodeDeposits/promoCodeDeposit.entity'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserInventory,
      Skin,
      Case,
      SkinCase,
      Bonus,
      Notification,
      PromoCode,
      PromoCodeBonus,
      PromoCodeDeposit,
    ]),
  ],
  providers: [UserService],
  controllers: [UserController],
  exports: [UserService],
})
export class UserModule {}
