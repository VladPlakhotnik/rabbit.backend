import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { PromoCode } from './entities/promoCode.entity'
import { PromoCodeReward } from './entities/promoCodeReward.entity'
import { PromoCodeService } from './promoCode.service'
import { PromoCodeController } from './promoCode.controller'
import { UserModule } from '../users/users.module'
import { UserBonusModule } from '../userBonuses/userBonus.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([PromoCode, PromoCodeReward]),
    UserModule,
    UserBonusModule,
  ],
  controllers: [PromoCodeController],
  providers: [PromoCodeService],
  exports: [PromoCodeService],
})
export class PromoCodeModule {}
