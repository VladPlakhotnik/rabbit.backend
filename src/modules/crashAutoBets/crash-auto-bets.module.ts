import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CrashAutoBetsController } from './crash-auto-bets.controller'
import { CrashAutoBetsService } from './crash-auto-bets.service'
import { CrashAutoBet } from './entities/crash-auto-bet.entity'

@Module({
  imports: [TypeOrmModule.forFeature([CrashAutoBet])],
  controllers: [CrashAutoBetsController],
  providers: [CrashAutoBetsService],
  exports: [CrashAutoBetsService],
})
export class CrashAutoBetsModule {}
