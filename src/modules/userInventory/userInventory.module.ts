import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { UserInventory } from './userInventory.entity'
import { CsgoSkin } from '../skins/csgo-skin.entity'
import { Case } from '../cases/case.entity'
import { SkinCase } from '../skinCase/skinCase.entity'
import { UserInventoryService } from './userInventory.service'
import { UserInventoryController } from './userInventory.controller'
import { User } from '../users/user.entity'

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserInventory, CsgoSkin, Case, SkinCase]),
  ],
  providers: [UserInventoryService],
  controllers: [UserInventoryController],
  exports: [UserInventoryService],
})
export class UserInventoryModule {}
