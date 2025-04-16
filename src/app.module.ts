import { Module } from '@nestjs/common'
import { DatabaseModule } from './core/database/database.module'
import { AuthModule } from './modules/auth/auth.module'
import { UserModule } from './modules/users/users.module'
import { CaseModule } from './modules/cases/case.module'
import { SectionModule } from './modules/sections/section.module'
import { NotificationModule } from './modules/notifications/notification.module'
import { UserInventoryModule } from './modules/userInventory/userInventory.module'
import { PromoCodeModule } from './modules/promoCodes/promoCode.module'
import { SkinModule } from './modules/skins/skin.module'
import { LiveDropModule } from './modules/liveDrop/liveDrop.module'
import { BonusModule } from './modules/bonuses/bonus.module'
import { ProvablyFairModule } from './modules/provably-fair/provably-fair.module'

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    UserModule,
    SectionModule,
    CaseModule,
    NotificationModule,
    UserInventoryModule,
    PromoCodeModule,
    SkinModule,
    BonusModule,
    ProvablyFairModule,
    // LiveDropModule,
    // TO DO
    // PaymentModule,
  ],
})
export class AppModule {}
