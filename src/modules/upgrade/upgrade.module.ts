import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { UpgradeController } from './upgrade.controller'
import { UpgradeService } from './upgrade.service'
import { User } from '../users/user.entity'
import { Skin } from '../skins/skin.entity'
import { UserInventory } from '../userInventory/userInventory.entity'

@Module({
  imports: [TypeOrmModule.forFeature([User, Skin, UserInventory])],
  controllers: [UpgradeController],
  providers: [UpgradeService],
  exports: [UpgradeService],
})
export class UpgradeModule {}
