// src/promoCodes/promoCode.service.ts

import { Injectable, BadRequestException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { PromoCode } from './promoCode.entity'
import { User } from '../users/user.entity'

@Injectable()
export class PromoCodeService {
  constructor(
    @InjectRepository(PromoCode)
    private readonly promoCodeRepository: Repository<PromoCode>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async activatePromoCode(code: string, userId: number) {
    // Найти промокод
    const promoCode = await this.promoCodeRepository.findOne({
      where: { code, is_active: true },
      relations: ['deposits', 'bonuses'],
    })

    if (!promoCode) {
      throw new BadRequestException('Invalid or inactive promo code')
    }

    // Проверить срок действия
    if (promoCode.expires_at && new Date() > promoCode.expires_at) {
      throw new BadRequestException('Promo code has expired')
    }

    // Проверить лимит активаций
    if (promoCode.current_activations >= promoCode.max_activations) {
      throw new BadRequestException('Promo code activation limit reached')
    }

    // Увеличить количество активаций
    promoCode.current_activations += 1

    let activationResult: any

    switch (promoCode.type) {
      case 'deposit':
        activationResult = await this.activateDeposit(promoCode, userId)
        break

      case 'bonus':
        activationResult = await this.activateBonus(promoCode)
        break

      case 'partner':
        activationResult = { message: 'Partner promo activated' }
        break

      default:
        throw new BadRequestException('Unknown promo code type')
    }

    // Сохранить изменения
    await this.promoCodeRepository.save(promoCode)

    return {
      message: 'Promo code activated successfully',
      activationResult,
    }
  }

  private async activateDeposit(promoCode: PromoCode, userId: number) {
    const user = await this.userRepository.findOne({ where: { id: userId } })

    if (!user) {
      throw new BadRequestException('User not found')
    }

    const totalDepositAmount = promoCode.deposits.reduce(
      (sum, deposit) => sum + parseFloat(deposit.deposit_amount.toString()),
      0,
    )

    user.balance = parseFloat(user.balance.toString()) + totalDepositAmount
    await this.userRepository.save(user)

    return {
      type: 'deposit',
      depositAmount: totalDepositAmount,
      newBalance: user.balance,
    }
  }

  private async activateBonus(promoCode: PromoCode) {
    const bonuses = promoCode.bonuses.map(bonus => ({
      type: bonus.bonus_type,
      value: bonus.bonus_value,
    }))
    return { type: 'bonus', bonuses }
  }
}
