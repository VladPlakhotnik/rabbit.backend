import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ThrottlerModule } from '@nestjs/throttler'
import { UpgradeController } from './upgrade.controller'
import { UpgradeService } from './upgrade.service'
import { User } from '../users/user.entity'
import { CsgoSkin } from '../skins/csgo-skin.entity'
import { UserInventory } from '../userInventory/userInventory.entity'
import { UserHistory } from '../userHistory/userHistory.entity'
import { UpgradeHistory } from '../userHistory/entities/upgrade-history.entity'
import { ClickerChallengesModule } from '../clickerChallenges/clicker-challenges.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      CsgoSkin,
      UserInventory,
      UserHistory,
      UpgradeHistory,
    ]),
    // Hard cap per IP: 10 upgrade attempts per minute. Cheap to bypass for a
    // motivated attacker (could rotate IPs), but stops trivial spamming
    // against a Math.random-based roll.
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 10,
      },
    ]),
    ClickerChallengesModule,
  ],
  controllers: [UpgradeController],
  providers: [UpgradeService],
  exports: [UpgradeService],
})
export class UpgradeModule {}
