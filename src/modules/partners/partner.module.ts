import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { PartnerProfile } from './entities/partnerProfile.entity'
import { PromoCode } from '../promoCodes/entities/promoCode.entity'
import { User } from '../users/user.entity'
import { PartnerService } from './partner.service'
import { PartnerController } from './partner.controller'

@Module({
  imports: [TypeOrmModule.forFeature([PartnerProfile, PromoCode, User])],
  controllers: [PartnerController],
  providers: [PartnerService],
  exports: [PartnerService],
})
export class PartnerModule {}
