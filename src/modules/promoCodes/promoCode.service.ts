import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  PromoCode,
  PromoCodeStatus,
  PromoCodeType,
} from './entities/promoCode.entity'
import { PromoCodeReward, RewardType } from './entities/promoCodeReward.entity'
import { CsgoSkin } from '../skins/csgo-skin.entity'
import { User } from '../users/user.entity'
import { UserService } from '../users/users.service'
import { UserBonusService } from '../userBonuses/userBonus.service'
import { PartnerService } from '../partners/partner.service'
import type {
  AdminPromoCodeListQueryDto,
  CreateAdminPromoCodeDto,
  UpdateAdminPromoCodeDto,
} from '../bonuses/dto/admin-bonus.dto'

export interface PromoCodeRewardInput {
  reward_type: RewardType
  value: number
  skin_id?: number | null
  min_deposit?: number | null
  max_bonus?: number | null
  is_demo?: boolean
}

export interface PromoCodeUpdateInput {
  code?: string
  type?: PromoCodeType
  status?: PromoCodeStatus
  description?: string | null
  max_uses?: number | null
  expires_at?: Date | string | null
  rewards?: PromoCodeRewardInput[]
}

export interface AdminPromoCodeListResult {
  filters: {
    rewardType: RewardType | null
    search: string | null
    status: PromoCodeStatus | null
    type: PromoCodeType | null
  }
  hasMore: boolean
  items: PromoCode[]
  limit: number
  page: number
  total: number
}

const hasPostgresCode = (error: unknown, code: string): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: string }).code === code

@Injectable()
export class PromoCodeService {
  constructor(
    @InjectRepository(PromoCode)
    private promoCodeRepository: Repository<PromoCode>,
    @InjectRepository(PromoCodeReward)
    private promoCodeRewardRepository: Repository<PromoCodeReward>,
    private readonly userService: UserService,
    private readonly userBonusService: UserBonusService,
    @Inject(forwardRef(() => PartnerService))
    private readonly partnerService: PartnerService,
  ) {}

  async findAll(): Promise<PromoCode[]> {
    return this.promoCodeRepository.find({
      relations: ['rewards', 'rewards.skin'],
    })
  }

  async findAllForAdmin(
    filters: AdminPromoCodeListQueryDto = {},
  ): Promise<AdminPromoCodeListResult> {
    const page = filters.page ?? 1
    const limit = Math.min(filters.limit ?? 20, 100)
    const search = filters.search?.trim() || null
    const status =
      filters.status && filters.status !== 'all' ? filters.status : null
    const type = filters.type && filters.type !== 'all' ? filters.type : null
    const rewardType =
      filters.rewardType && filters.rewardType !== 'all'
        ? filters.rewardType
        : null

    const qb = this.promoCodeRepository
      .createQueryBuilder('promo')
      .leftJoinAndSelect('promo.rewards', 'reward')
      .leftJoinAndSelect('reward.skin', 'skin')
      .leftJoinAndSelect('promo.created_by', 'createdBy')

    if (status) qb.andWhere('promo.status = :status', { status })
    if (type) qb.andWhere('promo.type = :type', { type })
    if (rewardType) {
      qb.andWhere('reward.reward_type = :rewardType', { rewardType })
    }
    if (search) {
      qb.andWhere(
        `(promo.code ILIKE :search OR COALESCE(promo.description, '') ILIKE :search OR CAST(promo.id AS TEXT) = :exactId)`,
        { exactId: search, search: `%${search}%` },
      )
    }

    const [items, total] = await qb
      .orderBy('promo.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount()

    return {
      filters: { rewardType, search, status, type },
      hasMore: page * limit < total,
      items,
      limit,
      page,
      total,
    }
  }

  async getAdminOverview(): Promise<{
    active: number
    expired: number
    inactive: number
    redemptions: number
    total: number
  }> {
    const [total, active, inactive, expired] = await Promise.all([
      this.promoCodeRepository.count(),
      this.promoCodeRepository.count({
        where: { status: PromoCodeStatus.ACTIVE },
      }),
      this.promoCodeRepository.count({
        where: { status: PromoCodeStatus.INACTIVE },
      }),
      this.promoCodeRepository.count({
        where: { status: PromoCodeStatus.EXPIRED },
      }),
    ])

    const raw = await this.promoCodeRepository
      .createQueryBuilder('promo')
      .select('COALESCE(SUM(promo.current_uses), 0)', 'redemptions')
      .getRawOne<{ redemptions?: string | number | null }>()

    return {
      active,
      expired,
      inactive,
      redemptions: Number(raw?.redemptions ?? 0),
      total,
    }
  }

  async findByCode(code: string): Promise<PromoCode> {
    const promoCode = await this.promoCodeRepository
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.rewards', 'rewards')
      .leftJoinAndSelect('rewards.skin', 'skin')
      .leftJoinAndSelect('p.created_by', 'created_by')
      .where('UPPER(p.code) = UPPER(:code)', { code })
      .getOne()

    if (!promoCode) {
      throw new NotFoundException('Promo code not found')
    }

    return promoCode
  }

  async findAdminByCode(code: string): Promise<PromoCode> {
    return this.findByCode(code)
  }

  async create(
    code: string,
    type: PromoCodeType,
    rewards: PromoCodeRewardInput[],
    description?: string,
    max_uses?: number,
    expires_at?: Date,
    created_by?: User,
  ): Promise<PromoCode> {
    // Проверяем, не существует ли уже такой код
    const normalizedCode = this.normalizeCode(code)
    const existing = await this.findExistingByCode(normalizedCode)

    if (existing) {
      throw new BadRequestException('Промокод уже существует')
    }

    // Создаем промокод
    const promoCode = this.promoCodeRepository.create({
      code: normalizedCode,
      type,
      status: PromoCodeStatus.ACTIVE,
      description: this.normalizeOptionalText(description),
      max_uses: max_uses ?? null,
      expires_at: expires_at ?? null,
      created_by,
    })

    await this.promoCodeRepository.save(promoCode)

    // Создаем награды
    const promoRewards = rewards.map(reward =>
      this.promoCodeRewardRepository.create(
        this.createRewardPayload(promoCode, reward),
      ),
    )

    await this.promoCodeRewardRepository.save(promoRewards)

    return this.findByCode(normalizedCode)
  }

  async createAdmin(dto: CreateAdminPromoCodeDto): Promise<PromoCode> {
    const code = this.normalizeCode(dto.code)
    const existing = await this.findExistingByCode(code)
    if (existing) {
      throw new ConflictException('Promo code already exists')
    }

    const promoCode = this.promoCodeRepository.create({
      code,
      description: this.normalizeOptionalText(dto.description),
      expires_at: this.normalizeDate(dto.expires_at) ?? null,
      max_uses: dto.max_uses ?? null,
      status: dto.status ?? PromoCodeStatus.ACTIVE,
      type: dto.type,
    })

    await this.promoCodeRepository.save(promoCode)
    await this.replaceRewards(promoCode, dto.rewards)

    return this.findAdminByCode(code)
  }

  async update(
    code: string,
    updateData: PromoCodeUpdateInput,
  ): Promise<PromoCode> {
    return this.updateAdmin(code, updateData)
  }

  async updateAdmin(
    code: string,
    updateData: PromoCodeUpdateInput | UpdateAdminPromoCodeDto,
  ): Promise<PromoCode> {
    const promoCode = await this.findByCode(code)
    const nextCode =
      updateData.code !== undefined
        ? this.normalizeCode(updateData.code)
        : promoCode.code

    if (nextCode !== promoCode.code) {
      const existing = await this.findExistingByCode(nextCode)
      if (existing && existing.id !== promoCode.id) {
        throw new ConflictException('Promo code already exists')
      }
      promoCode.code = nextCode
    }

    if (updateData.type !== undefined) promoCode.type = updateData.type
    if (updateData.status !== undefined) promoCode.status = updateData.status
    if (updateData.description !== undefined) {
      promoCode.description = this.normalizeOptionalText(updateData.description)
    }
    if (updateData.max_uses !== undefined) {
      promoCode.max_uses = updateData.max_uses
    }
    if (updateData.expires_at !== undefined) {
      promoCode.expires_at = this.normalizeDate(updateData.expires_at)
    }

    // Если есть новые награды, обновляем их
    if (updateData.rewards) {
      // Удаляем старые награды
      await this.replaceRewards(promoCode, updateData.rewards)

      // Создаем новые награды
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

    // Реферальные коды: привязываем родителя. Денежные награды (если когда-то добавим)
    // обрабатываются ниже общим путём.
    if (promoCode.type === PromoCodeType.REFERRAL) {
      await this.partnerService.attachReferralParent(userId, promoCode.code)
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

    if (results.length > 0) {
      await this.userBonusService.createPromoBonus(
        userId,
        promoCode.id,
        promoCode.expires_at || new Date(Date.now() + 24 * 60 * 60 * 1000),
      )
    }

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

  async removeAdmin(code: string): Promise<void> {
    const promoCode = await this.findByCode(code)

    try {
      await this.promoCodeRepository.remove(promoCode)
    } catch (error) {
      if (hasPostgresCode(error, '23503')) {
        throw new BadRequestException(
          'Promo code is referenced by user bonuses. Deactivate it instead.',
        )
      }
      throw error
    }
  }

  private normalizeCode(code: string): string {
    const normalized = code.trim().toUpperCase()
    if (!normalized) {
      throw new BadRequestException('Promo code is required')
    }
    return normalized
  }

  private normalizeOptionalText(
    value: string | null | undefined,
  ): string | null {
    const normalized = value?.trim()
    return normalized || null
  }

  private normalizeDate(
    value: Date | string | null | undefined,
  ): Date | null {
    if (value === undefined || value === null || value === '') return null
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('expires_at must be a valid date')
    }
    return date
  }

  private async findExistingByCode(code: string): Promise<PromoCode | null> {
    return this.promoCodeRepository
      .createQueryBuilder('promo')
      .where('UPPER(promo.code) = UPPER(:code)', { code })
      .getOne()
  }

  private createRewardPayload(
    promoCode: PromoCode,
    reward: PromoCodeRewardInput,
  ): Partial<PromoCodeReward> {
    return {
      is_demo: reward.is_demo ?? false,
      max_bonus: reward.max_bonus ?? null,
      min_deposit: reward.min_deposit ?? null,
      promo_code: promoCode,
      reward_type: reward.reward_type,
      skin: reward.skin_id ? ({ id: reward.skin_id } as CsgoSkin) : null,
      value: reward.value,
    }
  }

  private async replaceRewards(
    promoCode: PromoCode,
    rewards: PromoCodeRewardInput[],
  ): Promise<void> {
    if (!rewards.length) {
      throw new BadRequestException('Promo code must include at least one reward')
    }

    await this.promoCodeRewardRepository.delete({
      promo_code: { id: promoCode.id },
    })

    const promoRewards = rewards.map(reward =>
      this.promoCodeRewardRepository.create(
        this.createRewardPayload(promoCode, reward),
      ),
    )

    await this.promoCodeRewardRepository.save(promoRewards)
  }
}
