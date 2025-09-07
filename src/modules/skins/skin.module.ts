import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { HttpModule } from '@nestjs/axios'
import { CsgoSkin } from './csgo-skin.entity'
import { SkinController } from './skin.controller'
import { SkinSyncService } from './skins-sync'
import { SkinService } from './skin.service'
import { RateLimiterService } from './services/rate-limiter.service'
import { RetryService } from './services/retry.service'
import { DEFAULT_DMARKET_CONFIG } from './config/skin-sync.config'

@Module({
  imports: [TypeOrmModule.forFeature([CsgoSkin]), HttpModule],
  providers: [
    SkinSyncService,
    SkinService,
    RateLimiterService,
    RetryService,
    {
      provide: 'DMARKET_CONFIG',
      useValue: DEFAULT_DMARKET_CONFIG,
    },
  ],
  controllers: [SkinController],
  exports: [SkinService],
})
export class SkinModule {}
