import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { UserHistory } from './userHistory.entity'
import { CaseHistory } from './entities/case-history.entity'
import { UpgradeHistory } from './entities/upgrade-history.entity'
import { UserHistoryService } from './userHistory.service'
import { UserHistoryController } from './userHistory.controller'
import { CsgoSkin } from '../skins/csgo-skin.entity'

@Module({
  // CsgoSkin is registered here so the upgrade-history detail endpoint can
  // join `csgo_skins` for the target / material images. The history rows
  // themselves still snapshot name + price + rarity, so the JOIN is purely
  // for the picture and stays optional (LEFT JOIN; null for removed skins).
  imports: [
    TypeOrmModule.forFeature([UserHistory, CaseHistory, UpgradeHistory, CsgoSkin]),
  ],
  providers: [UserHistoryService],
  controllers: [UserHistoryController],
  exports: [UserHistoryService],
})
export class UserHistoryModule {}
