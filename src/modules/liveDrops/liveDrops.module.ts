import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Case } from '../cases/case.entity'
import { SkinCase } from '../skinCase/skinCase.entity'
import { DotaSkin } from '../skins/dota-skin.entity'
import { LiveDropsGateway } from './liveDrops.gateway'
import { LiveDropsService } from './liveDrops.service'
import { LiveDropBotsService } from './bots/bots.service'

// RedisModule is @Global, so REDIS_CLIENT/REDIS_SUBSCRIBER are injectable
// here without explicit import. Case + SkinCase + DotaSkin repos are
// needed by the bots service: pick a random case, then weighted-draw a
// skin from it. DotaSkin is required because SkinCase's @ManyToOne
// only joins to CsgoSkin — Dota cases have skin_hash_name pointing at
// dota_skins, which the bots service hydrates manually after the find.
//
// The legacy `live_drops` Postgres table was dropped — see
// migrations/drop_live_drops_table.sql. The feed now lives entirely in
// Redis (LPUSH + LTRIM in livedrop:feed, Pub/Sub fan-out on livedrop:new).
@Module({
  imports: [TypeOrmModule.forFeature([Case, SkinCase, DotaSkin])],
  providers: [LiveDropsGateway, LiveDropsService, LiveDropBotsService],
  exports: [LiveDropsService],
})
export class LiveDropsModule {}
