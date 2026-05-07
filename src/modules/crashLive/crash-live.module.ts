import { Module } from '@nestjs/common'
import { BotsModule } from '../bots/bots.module'
import { CrashLiveGateway } from './crash-live.gateway'
import { CrashLiveService } from './crash-live.service'

@Module({
  imports: [BotsModule],
  providers: [CrashLiveService, CrashLiveGateway],
  exports: [CrashLiveService],
})
export class CrashLiveModule {}
