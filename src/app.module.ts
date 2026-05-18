import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { APP_INTERCEPTOR } from '@nestjs/core'
import { ScheduleModule } from '@nestjs/schedule'
import { LoggingMiddleware } from './common/middleware/logging.middleware'
import { DatabaseModule } from './core/database/database.module'
import { RedisModule } from './core/redis/redis.module'
import { CatalogAuditModule } from './core/audit/catalog-audit.module'
import { IdempotencyModule } from './core/idempotency/idempotency.module'
import { PresenceModule } from './core/presence/presence.module'
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
import { ClickerAutoClickerLevelsModule } from './modules/clickerAutoClickerLevels/clicker-auto-clicker-levels.module'
import { ClickerCritClickLevelsModule } from './modules/clickerCritClickLevels/clicker-crit-click-levels.module'
import { ClickerBoostsModule } from './modules/clickerBoosts/clicker-boosts.module'
import { ClickerHistoryModule } from './modules/clickerHistory/clicker-history.module'
import { LiveDropsModule } from './modules/liveDrops/liveDrops.module'
import { UserHistoryModule } from './modules/userHistory/userHistory.module'
import { UpgradeModule } from './modules/upgrade/upgrade.module'
import { MinesModule } from './modules/mines/mines.module'
import { GiveawaysModule } from './modules/giveaways/giveaways.module'
import { NewsModule } from './modules/news/news.module'
import { PartnerModule } from './modules/partners/partner.module'
import { StatsModule } from './modules/stats/stats.module'
import { WithdrawModule } from './modules/withdraw/withdraw.module'
import { AdminModule } from './modules/admin/admin.module'
import { AdminMutationAuditInterceptor } from './modules/admin/interceptors/admin-mutation-audit.interceptor'
import { CrashAutoBetsModule } from './modules/crashAutoBets/crash-auto-bets.module'
import { CrashLiveModule } from './modules/crashLive/crash-live.module'
import { CrashModule } from './modules/crash/crash.module'
import { EarnVaultModule } from './modules/earnVault/earn-vault.module'
import { VipModule } from './modules/vip/vip.module'
import { BonusesModule } from './modules/bonuses/bonuses.module'
import { PaymentModule } from './modules/payments/payment.module'

@Module({
  imports: [
    // Cron scheduler — used by sync jobs (skin price / catalog) and any
    // future timed tasks. Module is global; @Cron on a provider method
    // is enough to register a job.
    ScheduleModule.forRoot(),
    DatabaseModule,
    RedisModule,
    CatalogAuditModule,
    IdempotencyModule,
    PresenceModule,
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
    ClickerAutoClickerLevelsModule,
    ClickerCritClickLevelsModule,
    ClickerBoostsModule,
    ClickerHistoryModule,
    LiveDropsModule,
    UserHistoryModule,
    UpgradeModule,
    MinesModule,
    GiveawaysModule,
    NewsModule,
    PartnerModule,
    StatsModule,
    WithdrawModule,
    CrashModule,
    CrashAutoBetsModule,
    CrashLiveModule,
    VipModule,
    BonusesModule,
    EarnVaultModule,
    PaymentModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: AdminMutationAuditInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  // Wire LoggingMiddleware on every route. One LOG line per request +
  // one per response, with the bearer token redacted. Necessary for
  // diagnosing "did /auth/refresh even reach the backend" type
  // questions — without it, NestJS only prints exceptions, not 200s.
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(LoggingMiddleware).forRoutes('*')
  }
}
