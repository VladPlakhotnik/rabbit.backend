import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { MinesController } from './mines.controller'
import { MinesService } from './mines.service'
import { MinesSession } from './entities/mines-session.entity'
import { UserInventory } from '../userInventory/userInventory.entity'
import { User } from '../users/user.entity'
import { MinesLiveGateway } from './live/mines-live.gateway'
import { MinesLiveBotsService } from './live/mines-live-bots.service'
import { MinesLiveService } from './live/mines-live.service'
import { BotsModule } from '../bots/bots.module'
import { VipModule } from '../vip/vip.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([MinesSession, User, UserInventory]),
    BotsModule,
    VipModule,
  ],
  controllers: [MinesController],
  providers: [
    MinesService,
    MinesLiveService,
    MinesLiveGateway,
    MinesLiveBotsService,
  ],
  exports: [MinesService],
})
export class MinesModule {}
