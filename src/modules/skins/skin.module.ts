import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { HttpModule, HttpService } from '@nestjs/axios'
import { CsgoSkin } from './csgo-skin.entity'
import { DotaSkin } from './dota-skin.entity'
import { SkinController } from './skin.controller'
import { CsgoSkinService } from './csgo/csgo-skin.service'
import { CsgoSyncService } from './csgo/csgo-sync.service'
import { DmarketCsgoClient } from './csgo/dmarket-csgo.client'
import { DotaSkinService } from './dota/dota-skin.service'
import { DotaSyncService } from './dota/dota-sync.service'
import { DmarketDotaClient } from './dota/dmarket-dota.client'
import { TmMarketClient } from './shared/market-tm.client'
import { RateLimiterService } from './services/rate-limiter.service'
import { RetryService } from './services/retry.service'
import { SyncSchedulerService } from './scheduler/sync-scheduler.service'
import { buildDMarketConfig } from './config/skin-sync.config'
import { SkinPurchaseService } from './skin-purchase.service'

// DI tokens for the per-game TM clients. Two instances of the same
// class — one pointed at market.csgo.com, one at market.dota2.net.
// Token strings are kept here (not exported as constants) because the
// services that inject them re-declare the literal locally to avoid
// circular imports module → service → module.
export const TM_CSGO_CLIENT = 'TM_CSGO_CLIENT'
export const TM_DOTA2_CLIENT = 'TM_DOTA2_CLIENT'

@Module({
  imports: [TypeOrmModule.forFeature([CsgoSkin, DotaSkin]), HttpModule],
  providers: [
    // --- DMarket config (shared by CS and Dota DMarket clients) ---
    {
      provide: 'DMARKET_CONFIG',
      useFactory: () => buildDMarketConfig(),
    },

    // --- Per-game TM market clients ---
    {
      provide: TM_CSGO_CLIENT,
      useFactory: (http: HttpService) =>
        new TmMarketClient(http, {
          baseUrl: 'https://market.csgo.com',
          apiKey: process.env.MARKET_CSGO_API_KEY ?? '',
          label: 'market.csgo.com',
        }),
      inject: [HttpService],
    },
    {
      provide: TM_DOTA2_CLIENT,
      useFactory: (http: HttpService) =>
        new TmMarketClient(http, {
          baseUrl: 'https://market.dota2.net',
          apiKey: process.env.MARKET_DOTA2_API_KEY ?? '',
          label: 'market.dota2.net',
        }),
      inject: [HttpService],
    },

    // --- DMarket support (shared) ---
    RateLimiterService,
    RetryService,

    // --- CSGO ---
    DmarketCsgoClient,
    CsgoSkinService,
    CsgoSyncService,

    // --- Dota 2 ---
    DmarketDotaClient,
    DotaSkinService,
    DotaSyncService,
    SkinPurchaseService,

    // --- Cron scheduler (drives both games) ---
    SyncSchedulerService,
  ],
  controllers: [SkinController],
  exports: [
    CsgoSkinService,
    DotaSkinService,
    // Per-game TM clients are exposed so WithdrawModule (and future
    // per-game services) can inject the right marketplace client by
    // game_type without re-declaring the providers.
    TM_CSGO_CLIENT,
    TM_DOTA2_CLIENT,
  ],
})
export class SkinModule {}
