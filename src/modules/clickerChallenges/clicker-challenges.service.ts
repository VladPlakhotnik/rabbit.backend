import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ClickerChallenge } from './entities/clicker_challenge.entity'
import { ClickerChallengeCondition } from './entities/clicker_challenge_condition.entity'
import { UpdateChallengeConditionDto } from './dto/update-challenge-condition.dto'

@Injectable()
export class ClickerChallengesService {
  constructor(
    @InjectRepository(ClickerChallenge)
    private readonly challengeRepository: Repository<ClickerChallenge>,
    @InjectRepository(ClickerChallengeCondition)
    private readonly conditionRepository: Repository<ClickerChallengeCondition>,
  ) {}

  findAll() {
    return this.challengeRepository.find({
      relations: ['condition'],
    })
  }

  findById(id: number) {
    return this.challengeRepository.findOne({
      where: { id },
      relations: ['condition'],
    })
  }

  create(data: Partial<ClickerChallenge>) {
    const challenge = this.challengeRepository.create(data)
    return this.challengeRepository.save(challenge)
  }

  update(id: number, data: Partial<ClickerChallenge>) {
    return this.challengeRepository.update(id, data)
  }

  remove(id: number) {
    return this.challengeRepository.delete(id)
  }

  async updateCondition(
    challengeId: number,
    conditionData: UpdateChallengeConditionDto,
  ) {
    const challenge = await this.findById(challengeId)
    if (!challenge) {
      throw new Error('Challenge not found')
    }

    if (!challenge.condition) {
      // Create new condition if it doesn't exist
      const newCondition = this.conditionRepository.create(conditionData)
      const savedCondition = await this.conditionRepository.save(newCondition)

      // Update challenge with new condition
      await this.challengeRepository.update(challengeId, {
        condition: savedCondition,
      })

      return this.findById(challengeId)
    }

    // Update existing condition
    await this.conditionRepository.update(challenge.condition.id, conditionData)
    return this.findById(challengeId)
  }
}
