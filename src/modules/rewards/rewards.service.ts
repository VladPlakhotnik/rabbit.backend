import { Injectable, BadRequestException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { Reward } from './entities/rewards.entity'
import { RewardsCooldown } from './entities/rewardsCooldown.entity'
import { UserBonusService } from '../userBonuses/userBonus.service'
import { RewardType } from './enums/reward-type.enum'

const SPIN_COOLDOWN_MS = 2 * 24 * 60 * 60 * 1000
// Bonus card lifetime — same window the user has to claim before it
// silently disappears (`getUserBonuses` filters by `expired_at > now`).
// Aligned with the spin cadence: a user can win at most ~one card per
// cooldown period, so two days keeps the inventory bonus tray small
// (1–2 cards typical). Older 14-day cards stay valid until their own
// expiry — no migration needed.
const BONUS_CARD_TTL_MS = 2 * 24 * 60 * 60 * 1000
const WHEEL_REWARD_TYPES = [
  RewardType.ITEM,
  RewardType.CASE,
  RewardType.RESPIN,
  RewardType.BALANCE,
  RewardType.CARROTS,
  RewardType.CODE,
]

export interface SpinStatus {
  canSpin: boolean
  nextAvailableAt: Date | null
  lastSpinAt: Date | null
}

export interface SpinResult {
  reward: Reward
  // Newly created `user_bonuses` row id — frontend's WheelResultModal
  // can claim this exact card via POST /user-bonuses/:id/claim without
  // a roundtrip through GET /user-bonuses/me to find which row was
  // just created.
  bonusId: number
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

  async getCatalog(): Promise<Reward[]> {
    return this.rewardRepository.find({
      where: {
        is_active: true,
        type: In(WHEEL_REWARD_TYPES),
      },
      relations: ['case', 'csgoSkin', 'dotaSkin'],
      order: { id: 'ASC' },
    })
  }

  async spin(userId: number): Promise<SpinResult> {
    const status = await this.getSpinStatus(userId)

    if (!status.canSpin) {
      throw new BadRequestException('Spin is not available yet')
    }

    // Order matches the wheel UI sectors (clockwise from pointer at top).
    // Frontend uses awardIndex to compute the rotation target.
    const rewards = await this.rewardRepository.find({
      where: { is_active: true, type: In(WHEEL_REWARD_TYPES) },
      relations: ['case', 'csgoSkin', 'dotaSkin'],
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

    const bonus = await this.userBonusService.createWheelBonus(
      userId,
      reward.id,
      expiredAt,
    )

    return { reward, bonusId: bonus.id, awardIndex, nextAvailableAt }
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
