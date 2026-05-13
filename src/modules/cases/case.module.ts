import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ThrottlerModule } from '@nestjs/throttler'
import { Case } from './case.entity'
import { CaseService } from './case.service'
import { CaseController } from './case.controller'
import { AdminCasesController } from './admin-cases.controller'
import { Section } from '../sections/section.entity'
import { SkinCase } from '../skinCase/skinCase.entity'
import { CsgoSkin } from '../skins/csgo-skin.entity'
import { DotaSkin } from '../skins/dota-skin.entity'
import { ProvablyFairModule } from '../provably-fair/provably-fair.module'
import { UserInventoryModule } from '../userInventory/userInventory.module'
import { UserModule } from '../users/users.module'
import { UserHistoryModule } from '../userHistory/userHistory.module'
import { LiveDropsModule } from '../liveDrops/liveDrops.module'
import { ClickerChallengesModule } from '../clickerChallenges/clicker-challenges.module'

@Module({
  imports: [
    // CsgoSkin + DotaSkin repos are injected into CaseService for
    // polymorphic case-opening: a Dota case's skin_case rows reference
    // hash_names in dota_skins, which the legacy ManyToOne to CsgoSkin
    // can't resolve, so the service hydrates them manually after
    // the initial JOIN.
    TypeOrmModule.forFeature([Case, Section, SkinCase, CsgoSkin, DotaSkin]),
    ProvablyFairModule,
    UserInventoryModule,
    UserModule,
    UserHistoryModule,
    LiveDropsModule,
    ClickerChallengesModule,
    // Per-IP rate limit, applied to the controller via @UseGuards.
    // Default is generous (60/min covers normal browsing); openCase
    // tightens this further with a per-method @Throttle override.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
  ],
  controllers: [CaseController, AdminCasesController],
  providers: [CaseService],
  exports: [CaseService],
})
export class CaseModule {}
