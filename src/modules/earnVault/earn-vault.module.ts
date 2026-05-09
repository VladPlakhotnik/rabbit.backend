import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ThrottlerModule } from '@nestjs/throttler'

import { User } from '../users/user.entity'
import { EarnVaultController } from './earn-vault.controller'
import { EarnVaultPosition } from './earn-vault-position.entity'
import { EarnVaultService } from './earn-vault.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([EarnVaultPosition, User]),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
  ],
  controllers: [EarnVaultController],
  providers: [EarnVaultService],
  exports: [EarnVaultService],
})
export class EarnVaultModule {}
