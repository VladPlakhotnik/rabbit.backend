import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { User } from '../users/user.entity'
import { BotProfileService } from './bot-profile.service'
import { BotProfile } from './entities/bot-profile.entity'

@Module({
  imports: [TypeOrmModule.forFeature([User, BotProfile])],
  providers: [BotProfileService],
  exports: [BotProfileService],
})
export class BotsModule {}
