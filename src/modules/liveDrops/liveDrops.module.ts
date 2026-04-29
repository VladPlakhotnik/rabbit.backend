import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Case } from '../cases/case.entity'
import { SkinCase } from '../skinCase/skinCase.entity'
import { LiveDropsGateway } from './liveDrops.gateway'
import { LiveDropsService } from './liveDrops.service'
import { LiveDropBotsService } from './bots/bots.service'

// RedisModule is @Global, so REDIS_CLIENT/REDIS_SUBSCRIBER are injectable
// here without explicit import. Case + SkinCase repos are needed only by
// the bots service: pick a random case, then weighted-draw a skin from it.
//
// The legacy `live_drops` Postgres table was dropped — see
// migrations/drop_live_drops_table.sql. The feed now lives entirely in
// Redis (LPUSH + LTRIM in livedrop:feed, Pub/Sub fan-out on livedrop:new).
@Module({
  imports: [TypeOrmModule.forFeature([Case, SkinCase])],
  providers: [LiveDropsGateway, LiveDropsService, LiveDropBotsService],
  exports: [LiveDropsService],
})
export class LiveDropsModule {}
