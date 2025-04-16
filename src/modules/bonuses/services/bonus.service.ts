import { Injectable, BadRequestException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Reward } from '../entities/rewards.entity'
import { UserSpinCooldown } from '../entities/userSpinCooldown.entity'

@Injectable()
export class BonusService {
  constructor(
    @InjectRepository(Reward)
    private rewardRepository: Repository<Reward>,
    @InjectRepository(UserSpinCooldown)
    private cooldownRepository: Repository<UserSpinCooldown>,
  ) {}

  async canUserSpin(userId: number): Promise<boolean> {
    const cooldown = await this.cooldownRepository.findOne({
      where: { user: { id: userId } },
    })

    if (!cooldown) {
      await this.cooldownRepository.save({
        user: { id: userId },
        last_spin: new Date(0),
        next_available: new Date(0),
      })
      return true
    }

    return new Date() >= cooldown.next_available
  }

  async spin(userId: number): Promise<Reward> {
    if (!(await this.canUserSpin(userId))) {
      throw new BadRequestException('Spin is not available yet')
    }

    const rewards = await this.rewardRepository.find({
      where: { is_active: true },
    })

    const reward = this.selectRandomReward(rewards)

    await this.cooldownRepository.update(
      { user: { id: userId } },
      {
        last_spin: new Date(),
        next_available: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    )

    return reward
  }

  private selectRandomReward(rewards: Reward[]): Reward {
    const totalChance = rewards.reduce(
      (sum, reward) => sum + reward.drop_chance,
      0,
    )
    let random = Math.random() * totalChance

    for (const reward of rewards) {
      random -= reward.drop_chance
      if (random <= 0) {
        return reward
      }
    }

    return rewards[0]
  }
}
