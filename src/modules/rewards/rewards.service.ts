import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { Reward } from './entities/rewards.entity'
import { RewardsCooldown } from './entities/rewardsCooldown.entity'
import { UserBonusService } from '../userBonuses/userBonus.service'
import { RewardType } from './enums/reward-type.enum'
import type {
  AdminRewardListQueryDto,
  CreateAdminRewardDto,
  UpdateAdminRewardDto,
} from '../bonuses/dto/admin-bonus.dto'
import type { GameType } from '../userInventory/userInventory.entity'

const SPIN_COOLDOWN_MS = 2 * 24 * 60 * 60 * 1000
// Bonus card lifetime — same window the user has to claim before it
// silently disappears (`getUserBonuses` filters by `expired_at > now`).
// Aligned with the spin cadence: a user can win at most ~one card per
// cooldown period, so two days keeps the inventory bonus tray small
// (1–2 cards typical). Older 14-day cards stay valid until their own
// expiry — no migration needed.
const BONUS_CARD_TTL_MS = 2 * 24 * 60 * 60 * 1000
export const WHEEL_REWARD_TYPES = [
  RewardType.ITEM,
  RewardType.CASE,
  RewardType.RESPIN,
  RewardType.BALANCE,
  RewardType.CARROTS,
  RewardType.CODE,
]

export interface AdminRewardListResult {
  filters: {
    active: boolean | null
    game_type: GameType | null
    search: string | null
    type: RewardType | null
  }
  hasMore: boolean
  items: Reward[]
  limit: number
  page: number
  total: number
}

const hasPostgresCode = (error: unknown, code: string): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: string }).code === code

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

  async findAllForAdmin(
    filters: AdminRewardListQueryDto = {},
  ): Promise<AdminRewardListResult> {
    const page = filters.page ?? 1
    const limit = Math.min(filters.limit ?? 20, 100)
    const search = filters.search?.trim() || null
    const active =
      typeof filters.active === 'boolean' ? filters.active : null
    const type = filters.type && filters.type !== 'all' ? filters.type : null
    const gameType =
      filters.game_type && filters.game_type !== 'all'
        ? filters.game_type
        : null

    const qb = this.rewardRepository
      .createQueryBuilder('reward')
      .leftJoinAndSelect('reward.case', 'caseEntity')
      .leftJoinAndSelect('reward.csgoSkin', 'csgoSkin')
      .leftJoinAndSelect('reward.dotaSkin', 'dotaSkin')

    if (active !== null) {
      qb.andWhere('reward.is_active = :active', { active })
    }
    if (type) {
      qb.andWhere('reward.type = :type', { type })
    }
    if (gameType) {
      qb.andWhere('reward.game_type = :gameType', { gameType })
    }
    if (search) {
      qb.andWhere(
        `(reward.name ILIKE :search OR COALESCE(reward.description, '') ILIKE :search OR CAST(reward.id AS TEXT) = :exactId OR COALESCE(caseEntity.name, '') ILIKE :search OR COALESCE(csgoSkin.market_hash_name, '') ILIKE :search OR COALESCE(dotaSkin.market_hash_name, '') ILIKE :search)`,
        { exactId: search, search: `%${search}%` },
      )
    }

    const [items, total] = await qb
      .orderBy('reward.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount()

    return {
      filters: { active, game_type: gameType, search, type },
      hasMore: page * limit < total,
      items,
      limit,
      page,
      total,
    }
  }

  async findAdminById(id: number): Promise<Reward> {
    const reward = await this.rewardRepository.findOne({
      where: { id },
      relations: ['case', 'csgoSkin', 'dotaSkin'],
    })
    if (!reward) {
      throw new NotFoundException('Reward not found')
    }
    return reward
  }

  async getAdminOverview(): Promise<{
    active: number
    total: number
    totalDropChance: number
    wheelTypes: number
  }> {
    const [total, active, activeRewards] = await Promise.all([
      this.rewardRepository.count(),
      this.rewardRepository.count({ where: { is_active: true } }),
      this.rewardRepository.find({
        where: { is_active: true, type: In(WHEEL_REWARD_TYPES) },
        select: ['drop_chance', 'type'],
      }),
    ])

    return {
      active,
      total,
      totalDropChance: activeRewards.reduce(
        (sum, reward) => sum + Number(reward.drop_chance ?? 0),
        0,
      ),
      wheelTypes: new Set(activeRewards.map(reward => reward.type)).size,
    }
  }

  async createAdmin(dto: CreateAdminRewardDto): Promise<Reward> {
    const reward = this.rewardRepository.create({
      description: this.normalizeOptionalText(dto.description),
      drop_chance: dto.drop_chance,
      is_active: dto.is_active ?? true,
      name: this.normalizeRequiredText(dto.name, 'name'),
      type: dto.type,
      value: dto.value,
    })

    Object.assign(reward, this.normalizeRewardLinks(dto))
    const saved = await this.rewardRepository.save(reward)
    return this.findAdminById(saved.id)
  }

  async updateAdmin(
    id: number,
    dto: UpdateAdminRewardDto,
  ): Promise<Reward> {
    const reward = await this.findAdminById(id)

    if (dto.type !== undefined) reward.type = dto.type
    if (dto.name !== undefined) {
      reward.name = this.normalizeRequiredText(dto.name, 'name')
    }
    if (dto.description !== undefined) {
      reward.description = this.normalizeOptionalText(dto.description)
    }
    if (dto.value !== undefined) reward.value = dto.value
    if (dto.drop_chance !== undefined) reward.drop_chance = dto.drop_chance
    if (dto.is_active !== undefined) reward.is_active = dto.is_active

    Object.assign(reward, this.normalizeRewardLinks(dto, reward))
    const saved = await this.rewardRepository.save(reward)
    return this.findAdminById(saved.id)
  }

  async removeAdmin(id: number): Promise<void> {
    const reward = await this.findAdminById(id)

    try {
      await this.rewardRepository.remove(reward)
    } catch (error) {
      if (hasPostgresCode(error, '23503')) {
        throw new BadRequestException(
          'Reward is referenced by user bonuses. Disable it instead.',
        )
      }
      throw error
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

  private normalizeRequiredText(value: string, field: string): string {
    const normalized = value.trim()
    if (!normalized) {
      throw new BadRequestException(`${field} is required`)
    }
    return normalized
  }

  private normalizeOptionalText(
    value: string | null | undefined,
  ): string | null {
    const normalized = value?.trim()
    return normalized || null
  }

  private normalizeRewardLinks(
    dto: CreateAdminRewardDto | UpdateAdminRewardDto,
    current?: Reward,
  ): Pick<
    Reward,
    'case_id' | 'csgo_skin_id' | 'dota_skin_id' | 'game_type'
  > {
    const type = dto.type ?? current?.type
    if (!type) {
      throw new BadRequestException('Reward type is required')
    }

    let caseId =
      dto.case_id !== undefined ? dto.case_id : (current?.case_id ?? null)
    let csgoSkinId =
      dto.csgo_skin_id !== undefined
        ? dto.csgo_skin_id
        : (current?.csgo_skin_id ?? null)
    let dotaSkinId =
      dto.dota_skin_id !== undefined
        ? dto.dota_skin_id
        : (current?.dota_skin_id ?? null)
    let gameType =
      dto.game_type !== undefined ? dto.game_type : (current?.game_type ?? null)

    if (type === RewardType.CASE) {
      if (!caseId) {
        throw new BadRequestException('case_id is required for CASE rewards')
      }
      return {
        case_id: caseId,
        csgo_skin_id: null,
        dota_skin_id: null,
        game_type: null,
      }
    }

    caseId = null

    if (type === RewardType.ITEM) {
      if (!gameType) {
        if (csgoSkinId) gameType = 'csgo'
        if (dotaSkinId) gameType = 'dota'
      }

      if (gameType === 'dota') {
        if (!dotaSkinId) {
          throw new BadRequestException(
            'dota_skin_id is required for Dota ITEM rewards',
          )
        }
        csgoSkinId = null
      } else {
        gameType = 'csgo'
        if (!csgoSkinId) {
          throw new BadRequestException(
            'csgo_skin_id is required for CS:GO ITEM rewards',
          )
        }
        dotaSkinId = null
      }

      return {
        case_id: null,
        csgo_skin_id: csgoSkinId,
        dota_skin_id: dotaSkinId,
        game_type: gameType,
      }
    }

    return {
      case_id: null,
      csgo_skin_id: null,
      dota_skin_id: null,
      game_type: null,
    }
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
