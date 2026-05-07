import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ClickerChallenge } from './entities/clicker_challenge.entity'
import { ClickerChallengeCondition } from './entities/clicker_challenge_condition.entity'
import { ClickerChallengeProgress } from './entities/clicker_challenge_progress.entity'
import { ClickerChallengesService } from './clicker-challenges.service'
import { ClickerChallengesController } from './clicker-challenges.controller'
import { ClickerUserModule } from '../clickerUser/clicker-user.module'
import { ClickerHistoryModule } from '../clickerHistory/clicker-history.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ClickerChallenge,
      ClickerChallengeCondition,
      ClickerChallengeProgress,
    ]),
    ClickerUserModule,
    ClickerHistoryModule,
  ],
  providers: [ClickerChallengesService],
  controllers: [ClickerChallengesController],
  exports: [ClickerChallengesService],
})
export class ClickerChallengesModule {}
