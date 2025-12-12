import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ClickerChallenge } from './entities/clicker_challenge.entity'
import { ClickerChallengeCondition } from './entities/clicker_challenge_condition.entity'
import { ClickerChallengesService } from './clicker-challenges.service'
import { ClickerChallengesController } from './clicker-challenges.controller'

@Module({
  imports: [
    TypeOrmModule.forFeature([ClickerChallenge, ClickerChallengeCondition]),
  ],
  providers: [ClickerChallengesService],
  controllers: [ClickerChallengesController],
  exports: [ClickerChallengesService],
})
export class ClickerChallengesModule {}
