import { Injectable, BadRequestException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Reward } from './entities/rewards.entity'
import { RewardsCooldown } from './entities/rewardsCooldown.entity'
import { UserBonusService } from '../userBonuses/userBonus.service'

// TEMP: shortened for QA. Restore to 48h before launch.
const SPIN_COOLDOWN_MS = 10 * 1000
const BONUS_CARD_TTL_MS = 14 * 24 * 60 * 60 * 1000 // 14 days to claim a wheel reward

export interface SpinStatus {
  canSpin: boolean
  nextAvailableAt: Date | null
  lastSpinAt: Date | null
}

export interface SpinResult {
  reward: Reward
  awardIndex: number
  nextAvailableAt: Date
}

@Injectable()
export class RewardsService {
  constructor(
    @InjectRepository(Reward)
    private rewardRepository: Repository<Reward>,
    @InjectRepository(RewardsCooldown)
    private cooldownRepository: Repository<RewardsCooldown>,
    private readonly userBonusService: UserBonusService,
  ) {}

  async getSpinStatus(userId: number): Promise<SpinStatus> {
    const cooldown = await this.cooldownRepository.findOne({
      where: { user: { id: userId } },
    })

    if (!cooldown) {
      return { canSpin: true, nextAvailableAt: null, lastSpinAt: null }
    }

    const now = new Date()
    const canSpin = now >= cooldown.next_available

    return {
      canSpin,
      nextAvailableAt: canSpin ? null : cooldown.next_available,
      lastSpinAt: cooldown.last_spin,
    }
  }

  async spin(userId: number): Promise<SpinResult> {
    const status = await this.getSpinStatus(userId)

    if (!status.canSpin) {
      throw new BadRequestException('Spin is not available yet')
    }

    // Order matches the wheel UI sectors (clockwise from pointer at top).
    // Frontend uses awardIndex to compute the rotation target.
    const rewards = await this.rewardRepository.find({
      where: { is_active: true },
      order: { id: 'ASC' },
    })

    if (rewards.length === 0) {
      throw new BadRequestException('No active rewards configured')
    }

    const reward = this.selectRandomReward(rewards)
    const awardIndex = rewards.findIndex(r => r.id === reward.id)

    const now = new Date()
    const nextAvailableAt = new Date(now.getTime() + SPIN_COOLDOWN_MS)
    const expiredAt = new Date(now.getTime() + BONUS_CARD_TTL_MS)

    const existingCooldown = await this.cooldownRepository.findOne({
      where: { user: { id: userId } },
    })

    if (existingCooldown) {
      existingCooldown.last_spin = now
      existingCooldown.next_available = nextAvailableAt
      await this.cooldownRepository.save(existingCooldown)
    } else {
      await this.cooldownRepository.save(
        this.cooldownRepository.create({
          user: { id: userId },
          last_spin: now,
          next_available: nextAvailableAt,
        }),
      )
    }

    await this.userBonusService.createWheelBonus(userId, reward.id, expiredAt)

    return { reward, awardIndex, nextAvailableAt }
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

    return rewards[0]!
  }
}
