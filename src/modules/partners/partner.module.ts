import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ThrottlerModule } from '@nestjs/throttler'
import { PartnerLevelConfig } from './entities/partnerLevel.entity'
import { PartnerProfile } from './entities/partnerProfile.entity'
import { PartnerCpmDailyStat } from './entities/partnerCpmDailyStat.entity'
import { PartnerCpmVisitor } from './entities/partnerCpmVisitor.entity'
import { PartnerCampaign } from './entities/partnerCampaign.entity'
import { PartnerCampaignDailyStat } from './entities/partnerCampaignDailyStat.entity'
import { PartnerCommissionLedger } from './entities/partnerCommissionLedger.entity'
import { PartnerPostbackSetting } from './entities/partnerPostbackSetting.entity'
import { PromoCode } from '../promoCodes/entities/promoCode.entity'
import { User } from '../users/user.entity'
import { PartnerService } from './partner.service'
import { PartnerController } from './partner.controller'
import { AdminPartnersController } from './admin-partners.controller'

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 180 }]),
    TypeOrmModule.forFeature([
      PartnerProfile,
      PartnerLevelConfig,
      PartnerCpmDailyStat,
      PartnerCpmVisitor,
      PartnerCampaign,
      PartnerCampaignDailyStat,
      PartnerCommissionLedger,
      PartnerPostbackSetting,
      PromoCode,
      User,
    ]),
  ],
  controllers: [PartnerController, AdminPartnersController],
  providers: [PartnerService],
  exports: [PartnerService],
})
export class PartnerModule {}
