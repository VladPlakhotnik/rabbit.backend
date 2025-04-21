import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  PromoCode,
  PromoCodeStatus,
  PromoCodeType,
} from './entities/promoCode.entity'
import { PromoCodeReward, RewardType } from './entities/promoCodeReward.entity'
import { User } from '../users/user.entity'
import { UserService } from '../users/users.service'
import { UserBonusService } from '../userBonuses/userBonus.service'
import { UpdatePromoCodeDto } from './promoCode.controller'

@Injectable()
export class PromoCodeService {
  constructor(
    @InjectRepository(PromoCode)
    private promoCodeRepository: Repository<PromoCode>,
    @InjectRepository(PromoCodeReward)
    private promoCodeRewardRepository: Repository<PromoCodeReward>,
    private readonly userService: UserService,
    private readonly userBonusService: UserBonusService,
  ) {}

  async findAll(): Promise<PromoCode[]> {
    return this.promoCodeRepository.find({
      relations: ['rewards'],
    })
  }

  async findByCode(code: string): Promise<PromoCode> {
    const promoCode = await this.promoCodeRepository.findOne({
      where: { code },
      relations: ['rewards'],
    })

    if (!promoCode) {
      throw new NotFoundException('Promo code not found')
    }

    return promoCode
  }

  async create(
    code: string,
    type: PromoCodeType,
    rewards: {
      reward_type: RewardType
      value: number
      skin_id?: number
      min_deposit?: number
      max_bonus?: number
      is_demo?: boolean
    }[],
    description?: string,
    max_uses?: number,
    expires_at?: Date,
    created_by?: User,
  ): Promise<PromoCode> {
    // Проверяем, не существует ли уже такой код
    const existing = await this.promoCodeRepository.findOne({
      where: { code },
    })

    if (existing) {
      throw new BadRequestException('Промокод уже существует')
    }

    // Создаем промокод
    const promoCode = this.promoCodeRepository.create({
      code,
      type,
      status: PromoCodeStatus.ACTIVE,
      description,
      max_uses,
      expires_at,
      created_by,
    })

    await this.promoCodeRepository.save(promoCode)

    // Создаем награды
    const promoRewards = rewards.map(reward =>
      this.promoCodeRewardRepository.create({
        promo_code: promoCode,
        ...reward,
      }),
    )

    await this.promoCodeRewardRepository.save(promoRewards)

    return this.findByCode(code)
  }

  async update(
    code: string,
    updateData: UpdatePromoCodeDto,
  ): Promise<PromoCode> {
    const promoCode = await this.findByCode(code)

    Object.assign(promoCode, {
      ...updateData,
      code: updateData.code || promoCode.code,
      type: updateData.type || promoCode.type,
      status: updateData.status || promoCode.status,
      description: updateData.description ?? promoCode.description,
      max_uses: updateData.max_uses ?? promoCode.max_uses,
      expires_at: updateData.expires_at || promoCode.expires_at,
    })

    // Если есть новые награды, обновляем их
    if (updateData.rewards) {
      // Удаляем старые награды
      await this.promoCodeRewardRepository.delete({
        promo_code: { id: promoCode.id },
      })

      // Создаем новые награды
      const newRewards = updateData.rewards.map(reward =>
        this.promoCodeRewardRepository.create({
          promo_code: promoCode,
          ...reward,
        }),
      )

      await this.promoCodeRewardRepository.save(newRewards)
    }

    await this.promoCodeRepository.save(promoCode)

    return this.findByCode(promoCode.code)
  }

  async activate(code: string, userId: number): Promise<any> {
    const promoCode = await this.findByCode(code)

    // Проверяем статус промокода
    if (promoCode.status !== PromoCodeStatus.ACTIVE) {
      throw new BadRequestException('Промокод неактивен')
    }

    // Проверяем срок действия
    if (promoCode.expires_at && promoCode.expires_at < new Date()) {
      throw new BadRequestException('Date of promo code expiration has passed')
    }

    // Проверяем количество использований
    if (
      promoCode.max_uses !== null &&
      promoCode.current_uses >= promoCode.max_uses
    ) {
      throw new BadRequestException(
        'The maximum number of uses has been exceeded',
      )
    }

    // Получаем пользователя
    const user = await this.userService.findById(userId)
    if (!user) {
      throw new NotFoundException('User not found')
    }

    // Обрабатываем каждую награду
    const results = []
    for (const reward of promoCode.rewards) {
      switch (reward.reward_type) {
        case RewardType.BALANCE:
          await this.userService.updateBalance(
            userId,
            user.balance + reward.value,
          )
          results.push({
            type: 'BALANCE',
            amount: reward.value,
          })
          break

        case RewardType.SKIN:
          // Здесь должна быть логика выдачи скина
          results.push({
            type: 'SKIN',
            skin_id: reward.skin?.id,
            is_demo: reward.is_demo,
          })
          break

        case RewardType.DEPOSIT_BONUS:
          // Бонус к депозиту обрабатывается отдельно при пополнении
          results.push({
            type: 'DEPOSIT_BONUS',
            percent: reward.value,
            min_deposit: reward.min_deposit,
            max_bonus: reward.max_bonus,
          })
          break
      }
    }

    await this.userBonusService.createPromoBonus(
      userId,
      promoCode.id,
      promoCode.expires_at || new Date(Date.now() + 24 * 60 * 60 * 1000),
    )

    // Увеличиваем счетчик использований
    promoCode.current_uses++
    await this.promoCodeRepository.save(promoCode)

    return {
      message: 'Promo code successfully activated',
      rewards: results,
    }
  }

  async deactivate(code: string): Promise<PromoCode> {
    const promoCode = await this.findByCode(code)
    promoCode.status = PromoCodeStatus.INACTIVE
    return this.promoCodeRepository.save(promoCode)
  }
}
