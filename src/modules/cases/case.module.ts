import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ThrottlerModule } from '@nestjs/throttler'
import { Case } from './case.entity'
import { CaseService } from './case.service'
import { CaseController } from './case.controller'
import { Section } from '../sections/section.entity'
import { SkinCase } from '../skinCase/skinCase.entity'
import { ProvablyFairModule } from '../provably-fair/provably-fair.module'
import { UserInventoryModule } from '../userInventory/userInventory.module'
import { UserModule } from '../users/users.module'
import { UserHistoryModule } from '../userHistory/userHistory.module'
import { LiveDropsModule } from '../liveDrops/liveDrops.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([Case, Section, SkinCase]),
    ProvablyFairModule,
    UserInventoryModule,
    UserModule,
    UserHistoryModule,
    LiveDropsModule,
    // Per-IP rate limit, applied to the controller via @UseGuards.
    // Default is generous (60/min covers normal browsing); openCase
    // tightens this further with a per-method @Throttle override.
    ThrottlerModule.forRoot([
      { ttl: 60_000, limit: 60 },
    ]),
  ],
  controllers: [CaseController],
  providers: [CaseService],
  exports: [CaseService],
})
export class CaseModule {}
