import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { UserInventory } from '../userInventory/userInventory.entity'
import { User } from '../users/user.entity'
import { CrashController } from './crash.controller'
import { CrashService } from './crash.service'
import { CrashSession } from './entities/crash-session.entity'

@Module({
  imports: [TypeOrmModule.forFeature([CrashSession, User, UserInventory])],
  controllers: [CrashController],
  providers: [CrashService],
  exports: [CrashService],
})
export class CrashModule {}
