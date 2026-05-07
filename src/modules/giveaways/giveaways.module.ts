import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Giveaway } from './entities/giveaway.entity'
import { GiveawaysService } from './giveaways.service'
import { GiveawaysController } from './giveaways.controller'
import { User } from '../users/user.entity'
import { CsgoSkin } from '../skins/csgo-skin.entity'
import { UserInventory } from '../userInventory/userInventory.entity'
import { NotificationModule } from '../notifications/notification.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([Giveaway, User, CsgoSkin, UserInventory]),
    NotificationModule,
  ],
  controllers: [GiveawaysController],
  providers: [GiveawaysService],
  exports: [GiveawaysService],
})
export class GiveawaysModule {}
