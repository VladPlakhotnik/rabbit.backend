import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ClickerCase } from './entities/clicker_case.entity'
import { ClickerSkinCase } from './entities/clicker_skin_case.entity'
import { ClickerCasesService } from './clicker-cases.service'
import { ClickerCasesController } from './clicker-cases.controller'
import { ClickerUserModule } from '../clickerUser/clicker-user.module'
import { ProvablyFairModule } from '../provably-fair/provably-fair.module'
import { UserInventoryModule } from '../userInventory/userInventory.module'
import { UserHistoryModule } from '../userHistory/userHistory.module'
import { LiveDropsModule } from '../liveDrops/liveDrops.module'
import { UserModule } from '../users/users.module'
import { ClickerChallengesModule } from '../clickerChallenges/clicker-challenges.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([ClickerCase, ClickerSkinCase]),
    ClickerUserModule,
    ProvablyFairModule,
    UserInventoryModule,
    UserHistoryModule,
    LiveDropsModule,
    UserModule,
    ClickerChallengesModule,
  ],
  providers: [ClickerCasesService],
  controllers: [ClickerCasesController],
  exports: [ClickerCasesService],
})
export class ClickerCasesModule {}
