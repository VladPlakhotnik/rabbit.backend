import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, MoreThan } from 'typeorm'
import { UserBonus, BonusType } from './userBonus.entity'

@Injectable()
export class UserBonusService {
  constructor(
    @InjectRepository(UserBonus)
    private userBonusRepository: Repository<UserBonus>,
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
    const bonus = await this.userBonusRepository.findOne({
      where: {
        id: bonusId,
        user_id: userId,
        is_claimed: false,
        expired_at: MoreThan(new Date()),
      },
    })

    if (!bonus) {
      throw new Error('Bonus not found or already claimed or expired')
    }

    bonus.is_claimed = true
    return this.userBonusRepository.save(bonus)
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
}
