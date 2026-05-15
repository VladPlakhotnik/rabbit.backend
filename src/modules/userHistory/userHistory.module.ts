import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { UserHistory } from './userHistory.entity'
import { CaseHistory } from './entities/case-history.entity'
import { UpgradeHistory } from './entities/upgrade-history.entity'
import { UserHistoryService } from './userHistory.service'
import { UserHistoryController } from './userHistory.controller'
import { AdminUserHistoryController } from './admin-user-history.controller'
import { CsgoSkin } from '../skins/csgo-skin.entity'
import { DotaSkin } from '../skins/dota-skin.entity'
import { CrashSession } from '../crash/entities/crash-session.entity'

@Module({
  // CsgoSkin + DotaSkin are registered here so the upgrade-history
  // detail endpoint can join the right catalog for the target /
  // material images, polymorphic on the upgrade row's `game_type`.
  // History rows themselves snapshot name + price + rarity, so the
  // JOIN is purely for the picture and stays optional (null for
  // removed skins).
  imports: [
    TypeOrmModule.forFeature([
      UserHistory,
      CaseHistory,
      UpgradeHistory,
      CrashSession,
      CsgoSkin,
      DotaSkin,
    ]),
  ],
  providers: [UserHistoryService],
  controllers: [UserHistoryController, AdminUserHistoryController],
  exports: [UserHistoryService],
})
export class UserHistoryModule {}
