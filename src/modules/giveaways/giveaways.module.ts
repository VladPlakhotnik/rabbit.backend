import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Giveaway } from './entities/giveaway.entity'
import { GiveawaysService } from './giveaways.service'
import { GiveawaysController } from './giveaways.controller'
import { User } from '../users/user.entity'
import { CsgoSkin } from '../skins/csgo-skin.entity'
import { UserInventory } from '../userInventory/userInventory.entity'
import { NotificationModule } from '../notifications/notification.module'
import { BotsModule } from '../bots/bots.module'
import { UserDeposit } from '../users/user-deposit.entity'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Giveaway,
      User,
      CsgoSkin,
      UserInventory,
      UserDeposit,
    ]),
    NotificationModule,
    BotsModule,
  ],
  controllers: [GiveawaysController],
  providers: [GiveawaysService],
  exports: [GiveawaysService],
})
export class GiveawaysModule {}
