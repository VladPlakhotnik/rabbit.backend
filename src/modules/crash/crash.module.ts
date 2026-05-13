import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CrashLiveModule } from '../crashLive/crash-live.module'
import { UserInventory } from '../userInventory/userInventory.entity'
import { User } from '../users/user.entity'
import { AdminCrashController } from './admin-crash.controller'
import { CrashController } from './crash.controller'
import { CrashService } from './crash.service'
import { CrashSession } from './entities/crash-session.entity'
import { VipModule } from '../vip/vip.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([CrashSession, User, UserInventory]),
    CrashLiveModule,
    VipModule,
  ],
  controllers: [CrashController, AdminCrashController],
  providers: [CrashService],
  exports: [CrashService],
})
export class CrashModule {}
