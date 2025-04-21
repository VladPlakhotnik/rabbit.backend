import { Module } from '@nestjs/common'
import { DatabaseModule } from './core/database/database.module'
import { AuthModule } from './modules/auth/auth.module'
import { UserModule } from './modules/users/users.module'
import { CaseModule } from './modules/cases/case.module'
import { SectionModule } from './modules/sections/section.module'
import { NotificationModule } from './modules/notifications/notification.module'
import { UserInventoryModule } from './modules/userInventory/userInventory.module'
import { SkinModule } from './modules/skins/skin.module'
import { RewardsModule } from './modules/rewards/rewards.module'
import { ProvablyFairModule } from './modules/provably-fair/provably-fair.module'
import { PromoCodeModule } from './modules/promoCodes/promoCode.module'

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    UserModule,
    SectionModule,
    CaseModule,
    NotificationModule,
    UserInventoryModule,
    SkinModule,
    RewardsModule,
    ProvablyFairModule,
    PromoCodeModule,
    // TO DO
    // PaymentModule,
  ],
})
export class AppModule {}
