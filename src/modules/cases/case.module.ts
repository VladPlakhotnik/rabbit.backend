import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Case } from './case.entity'
import { CaseService } from './case.service'
import { CaseController } from './case.controller'
import { Section } from '../sections/section.entity'
import { SkinCase } from '../skinCase/skinCase.entity'
import { ProvablyFairModule } from '../provably-fair/provably-fair.module'
import { UserInventoryModule } from '../userInventory/userInventory.module'
import { UserModule } from '../users/users.module'
import { UserHistoryModule } from '../userHistory/userHistory.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([Case, Section, SkinCase]),
    ProvablyFairModule,
    UserInventoryModule,
    UserModule,
    UserHistoryModule,
  ],
  controllers: [CaseController],
  providers: [CaseService],
  exports: [CaseService],
})
export class CaseModule {}
