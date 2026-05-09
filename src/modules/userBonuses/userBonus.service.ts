import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, Repository, MoreThan } from 'typeorm'
import { UserBonus, BonusType } from './userBonus.entity'
import { RewardType } from '../rewards/enums/reward-type.enum'
import { RewardsCooldown } from '../rewards/entities/rewardsCooldown.entity'
import { User } from '../users/user.entity'
import { ClickerUserService } from '../clickerUser/clicker-user.service'
import { UserInventoryService } from '../userInventory/userInventory.service'
import { CaseService } from '../cases/case.service'

const roundMoney = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100

const toNumber = (value: unknown): number => {
  const numberValue = typeof value === 'number' ? value : Number(value)

  return Number.isFinite(numberValue) ? numberValue : 0
}

@Injectable()
export class UserBonusService {
  constructor(
    @InjectRepository(UserBonus)
    private userBonusRepository: Repository<UserBonus>,
    private readonly clickerUserService: ClickerUserService,
    private readonly userInventoryService: UserInventoryService,
    private readonly caseService: CaseService,
  ) {}

  async createPromoBonus(
    userId: number,
    promoCodeId: number,
    expiredAt: Date,
  ): Promise<UserBonus> {
    const bonus = this.userBonusRepository.create({
      user_id: userId,
      bonus_type: BonusType.PROMO,
      promo_code_id: promoCodeId,
      is_claimed: false,
      expired_at: expiredAt,
      last_claimed_at: new Date(),
    })

    return this.userBonusRepository.save(bonus)
  }

  async createWheelBonus(
    userId: number,
    rewardId: number,
    expiredAt: Date,
  ): Promise<UserBonus> {
    const bonus = this.userBonusRepository.create({
      user_id: userId,
      bonus_type: BonusType.WHEEL,
      reward_id: rewardId,
      is_claimed: false,
      expired_at: expiredAt,
      last_claimed_at: new Date(),
    })

    return this.userBonusRepository.save(bonus)
  }

  async getUserBonuses(userId: number): Promise<UserBonus[]> {
    return this.userBonusRepository.find({
      where: {
        user_id: userId,
        is_claimed: false,
        expired_at: MoreThan(new Date()),
      },
      relations: ['reward', 'promoCode'],
    })
  }

  async claimBonus(bonusId: number, userId: number): Promise<UserBonus> {
    return this.userBonusRepository.manager.transaction(async manager => {
      const bonusLookup = {
        where: {
          id: bonusId,
          user_id: userId,
          is_claimed: false,
          expired_at: MoreThan(new Date()),
        },
      }

      const lockedBonus = await manager.findOne(UserBonus, {
        ...bonusLookup,
        lock: { mode: 'pessimistic_write' },
      })

      if (!lockedBonus) {
        throw new Error('Bonus not found or already claimed or expired')
      }

      const bonus = await manager.findOne(UserBonus, {
        where: { id: lockedBonus.id },
        relations: [
          'reward',
          'reward.case',
          'reward.csgoSkin',
          'reward.dotaSkin',
          'promoCode',
        ],
      })

      if (!bonus) {
        throw new Error('Bonus relation payload not found')
      }

      await this.applyClaimPayout(manager, bonus, userId)

      bonus.is_claimed = true
      bonus.last_claimed_at = new Date()
      return manager.save(UserBonus, bonus)
    })
  }

  async hasActivePromoCode(
    userId: number,
    promoCodeId: number,
  ): Promise<boolean> {
    const bonus = await this.userBonusRepository.findOne({
      where: {
        user_id: userId,
        promo_code_id: promoCodeId,
      },
    })

    return !!bonus
  }

  private async applyClaimPayout(
    manager: EntityManager,
    bonus: UserBonus,
    userId: number,
  ): Promise<void> {
    if (bonus.bonus_type !== BonusType.WHEEL || !bonus.reward) {
      return
    }

    if (
      bonus.reward.type === RewardType.BALANCE ||
      bonus.reward.type === RewardType.MONEY
    ) {
      await this.creditUserBalance(manager, userId, bonus.reward.value)
      return
    }

    if (bonus.reward.type === RewardType.RESPIN) {
      await this.resetWheelCooldown(manager, userId)
      return
    }

    if (bonus.reward.type === RewardType.CARROTS) {
      await this.clickerUserService.grantWheelRewardPoints(
        userId,
        toNumber(bonus.reward.value),
      )
      return
    }

    if (bonus.reward.type === RewardType.CASE) {
      if (!bonus.reward.case_id) {
        throw new Error('Reward case is not configured')
      }
      await this.caseService.openFreeCase(bonus.reward.case_id, userId)
      return
    }

    if (bonus.reward.type === RewardType.ITEM) {
      const gameType = bonus.reward.game_type ?? 'csgo'
      const skin =
        gameType === 'dota' ? bonus.reward.dotaSkin : bonus.reward.csgoSkin

      if (!skin) {
        throw new Error('Reward skin is not configured')
      }

      await this.userInventoryService.createInventoryFromReward(
        userId,
        skin,
        gameType,
      )
    }
  }

  private async creditUserBalance(
    manager: EntityManager,
    userId: number,
    rawAmount: unknown,
  ): Promise<void> {
    const amount = toNumber(rawAmount)
    if (amount <= 0) return

    const user = await manager.findOne(User, {
      where: { id: userId },
      lock: { mode: 'pessimistic_write' },
    })
    if (!user) {
      throw new Error('User not found')
    }

    user.balance = roundMoney(toNumber(user.balance) + amount)
    await manager.save(User, user)
  }

  private async resetWheelCooldown(
    manager: EntityManager,
    userId: number,
  ): Promise<void> {
    const cooldown = await manager.findOne(RewardsCooldown, {
      where: { user: { id: userId } },
      lock: { mode: 'pessimistic_write' },
    })

    if (!cooldown) return

    cooldown.next_available = new Date()
    await manager.save(RewardsCooldown, cooldown)
  }
}
