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
import { AppController } from './app.controller'
import { ClickerCasesModule } from './modules/clickerCase/clicker-cases.module'
import { ClickerUserModule } from './modules/clickerUser/clicker-user.module'
import { ClickerChallengesModule } from './modules/clickerChallenges/clicker-challenges.module'
import { ClickerLevelsModule } from './modules/clickerLevels/clicker-levels.module'
import { ClickerClickLevelsModule } from './modules/clickerClickLevels/clicker-click-levels.module'
import { ClickerEnergyLevelsModule } from './modules/clickerEnergyLevels/clicker-energy-levels.module'
import { LiveDropsModule } from './modules/liveDrops/liveDrops.module'
import { UserHistoryModule } from './modules/userHistory/userHistory.module'
import { UpgradeModule } from './modules/upgrade/upgrade.module'
import { MinesModule } from './modules/mines/mines.module'
import { GiveawaysModule } from './modules/giveaways/giveaways.module'
import { NewsModule } from './modules/news/news.module'

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
    ClickerCasesModule,
    ClickerUserModule,
    ClickerChallengesModule,
    ClickerLevelsModule,
    ClickerClickLevelsModule,
    ClickerEnergyLevelsModule,
    LiveDropsModule,
    UserHistoryModule,
    UpgradeModule,
    MinesModule,
    GiveawaysModule,
    NewsModule,
    // TO DO
    // PaymentModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
