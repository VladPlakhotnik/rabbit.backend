import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { UpgradeController } from './upgrade.controller'
import { UpgradeService } from './upgrade.service'
import { User } from '../users/user.entity'
import { CsgoSkin } from '../skins/csgo-skin.entity'
import { UserInventory } from '../userInventory/userInventory.entity'
import { UserHistory } from '../userHistory/userHistory.entity'
import { UserHistoryModule } from '../userHistory/userHistory.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([User, CsgoSkin, UserInventory, UserHistory]),
    UserHistoryModule,
  ],
  controllers: [UpgradeController],
  providers: [UpgradeService],
  exports: [UpgradeService],
})
export class UpgradeModule {}
