import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { User } from '../users/user.entity'
import { PromoCodeController } from './promoCode.controller'
import { PromoCodeService } from './promoCode.service'
import { PromoCode } from './promoCode.entity'

@Module({
  imports: [TypeOrmModule.forFeature([User, PromoCode])],
  providers: [PromoCodeService],
  controllers: [PromoCodeController],
  exports: [PromoCodeService],
})
export class PromoCodeModule {}
