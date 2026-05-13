import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common'
import { InjectEntityManager } from '@nestjs/typeorm'
import { EntityManager } from 'typeorm'
import {
  buildPaginatedResponse,
  normalizePagination,
  type PaginatedResponse,
} from '../../common/pagination'
import { User } from '../users/user.entity'
import { UserInventory } from '../userInventory/userInventory.entity'
import { UpgradeDto } from './dto/upgrade.dto'
import { UpgradeResultDto } from './dto/upgrade-result.dto'
import { UpgradeLimitsDto } from './dto/upgrade-limits.dto'
import { UPGRADE_LIMITS } from './upgrade.constants'
import {
  UPGRADE_HOUSE_RETURN,
  calculateUpgradeChanceByPrice,
} from './upgrade-game.logic'
import { CsgoSkin } from '../skins/csgo-skin.entity'
import { DotaSkin } from '../skins/dota-skin.entity'
import {
  UpgradeHistory,
  UpgradeHistoryMaterial,
  UpgradeMode,
} from '../userHistory/entities/upgrade-history.entity'

type UpgradeGameType = 'csgo' | 'dota'
import { UserHistory } from '../userHistory/userHistory.entity'
import { HistoryAction } from '../userHistory/enums/history-action.enum'
import { ClickerChallengesService } from '../clickerChallenges/clicker-challenges.service'
import {
  calculateFixedHouseEdgeVipEarning,
  estimateUpgradeHouseEdgeBps,
} from '../vip/vip-earning.logic'
import { VipService } from '../vip/vip.service'
import type { AdminUpgradeListQueryDto } from './dto/admin-upgrade.dto'

const RARITY_COLUMN_LIMIT = 50
// Sentinels stored in `old_rarity` / `new_rarity` for cases where there is no
// real rarity to record (balance-mode source, failed roll).
const BALANCE_RARITY = 'balance'
const FAILED_RARITY = 'failed'
const UNKNOWN_RARITY = 'unknown'

interface BalanceUpgradeContext {
  targetSkin: CsgoSkin
  chance: number
  upgradeAmount: number
}

interface InventoryUpgradeContext {
  usedSkins: CsgoSkin[]
  usedMaterials: UpgradeMaterialContext[]
  targetSkin: CsgoSkin
  chance: number
  totalUsedPrice: number
}

interface UpgradeMaterialContext {
  skin: CsgoSkin
  gameType: UpgradeGameType
}

export interface AdminUpgradeSettings extends UpgradeLimitsDto {
  game_types: UpgradeGameType[]
  modes: UpgradeMode[]
}

export interface AdminUpgradeUser {
  avatar: string | null
  display_name: string
  id: number
}

export interface AdminUpgradeTarget {
  id: number
  image?: string | null
  name: string
  price: number
  rarity: string
}

export interface AdminUpgradeMaterial {
  game_type: UpgradeGameType
  image?: string | null
  name: string
  price: number
  rarity: string
  skin_id: number
}

export interface AdminUpgradeAttempt {
  chance: number
  cost: number
  created_at: Date
  game_type: UpgradeGameType
  id: number
  mode: UpgradeMode
  multiplier: number
  payout: number
  project_profit: number
  success: boolean
  target: AdminUpgradeTarget
  user: AdminUpgradeUser
}

export interface AdminUpgradeDetail extends AdminUpgradeAttempt {
  materials: AdminUpgradeMaterial[]
}

export interface AdminUpgradeOverview {
  average_chance: number
  failed_attempts: number
  observed_rtp: number
  settings: AdminUpgradeSettings
  success_rate: number
  successful_attempts: number
  top_payout: number
  total_attempts: number
  total_payout: number
  total_profit: number
  total_wagered: number
}

@Injectable()
export class UpgradeService {
  private readonly logger = new Logger(UpgradeService.name)

  // Entire service is transactional — every read/write goes through the
  // `manager` inside `performUpgrade.transaction(...)`. Injecting
  // `EntityManager` (instead of a single repository) makes that explicit and
  // documents that the service touches multiple tables (User, UserInventory,
  // CsgoSkin, UpgradeHistory, UserHistory) without scattering repository
  // injections that would never be used outside the transaction anyway.
  constructor(
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
    private readonly clickerChallengesService: ClickerChallengesService,
    private readonly vipService: VipService,
  ) {}

  getAdminSettings(): AdminUpgradeSettings {
    return {
      ...this.getLimits(),
      game_types: ['csgo', 'dota'],
      modes: ['balance', 'inventory'],
    }
  }

  async getAdminOverview(): Promise<AdminUpgradeOverview> {
    const raw = await this.entityManager
      .createQueryBuilder(UpgradeHistory, 'upgrade')
      .select('COUNT(*)', 'total_attempts')
      .addSelect(
        `COALESCE(SUM(CASE WHEN COALESCE(upgrade.success, false) = true THEN 1 ELSE 0 END), 0)`,
        'successful_attempts',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN COALESCE(upgrade.success, false) = false THEN 1 ELSE 0 END), 0)`,
        'failed_attempts',
      )
      .addSelect('COALESCE(SUM(upgrade.cost), 0)', 'total_wagered')
      .addSelect(
        `COALESCE(SUM(CASE WHEN COALESCE(upgrade.success, false) = true THEN COALESCE(upgrade.skin_price, 0) ELSE 0 END), 0)`,
        'total_payout',
      )
      .addSelect(
        `COALESCE(MAX(CASE WHEN COALESCE(upgrade.success, false) = true THEN COALESCE(upgrade.skin_price, 0) ELSE 0 END), 0)`,
        'top_payout',
      )
      .addSelect('COALESCE(AVG(COALESCE(upgrade.chance, 0)), 0)', 'average_chance')
      .getRawOne<{
        average_chance: string | number | null
        failed_attempts: string | number | null
        successful_attempts: string | number | null
        top_payout: string | number | null
        total_attempts: string | number | null
        total_payout: string | number | null
        total_wagered: string | number | null
      }>()

    const totalAttempts = this.toNumber(raw?.total_attempts)
    const successfulAttempts = this.toNumber(raw?.successful_attempts)
    const totalWagered = this.toNumber(raw?.total_wagered)
    const totalPayout = this.toNumber(raw?.total_payout)

    return {
      average_chance: this.roundMoney(this.toNumber(raw?.average_chance)),
      failed_attempts: this.toNumber(raw?.failed_attempts),
      observed_rtp:
        totalWagered > 0 ? this.roundMoney((totalPayout / totalWagered) * 100) : 0,
      settings: this.getAdminSettings(),
      success_rate:
        totalAttempts > 0
          ? this.roundMoney((successfulAttempts / totalAttempts) * 100)
          : 0,
      successful_attempts: successfulAttempts,
      top_payout: this.roundMoney(this.toNumber(raw?.top_payout)),
      total_attempts: totalAttempts,
      total_payout: this.roundMoney(totalPayout),
      total_profit: this.roundMoney(totalWagered - totalPayout),
      total_wagered: this.roundMoney(totalWagered),
    }
  }

  async findAllForAdmin(
    filters: AdminUpgradeListQueryDto = {},
  ): Promise<PaginatedResponse<AdminUpgradeAttempt>> {
    const pagination = normalizePagination({
      limit: filters.limit,
      page: filters.page,
    })
    const queryBuilder = this.entityManager
      .createQueryBuilder(UpgradeHistory, 'upgrade')
      .leftJoinAndSelect('upgrade.user', 'user')
    let hasWhere = false

    const addWhere = (condition: string, parameters?: Record<string, unknown>) => {
      if (!hasWhere) {
        queryBuilder.where(condition, parameters)
        hasWhere = true
        return
      }
      queryBuilder.andWhere(condition, parameters)
    }

    if (filters.success !== undefined) {
      addWhere('COALESCE(upgrade.success, false) = :success', {
        success: filters.success,
      })
    }

    if (filters.mode) {
      addWhere('upgrade.mode = :mode', { mode: filters.mode })
    }

    if (filters.gameType) {
      addWhere('upgrade.game_type = :gameType', { gameType: filters.gameType })
    }

    if (filters.userId !== undefined) {
      addWhere('upgrade.user_id = :userId', { userId: filters.userId })
    }

    if (filters.minCost !== undefined) {
      addWhere('upgrade.cost >= :minCost', { minCost: filters.minCost })
    }

    if (filters.maxCost !== undefined) {
      addWhere('upgrade.cost <= :maxCost', { maxCost: filters.maxCost })
    }

    if (filters.minChance !== undefined) {
      addWhere('COALESCE(upgrade.chance, 0) >= :minChance', {
        minChance: filters.minChance,
      })
    }

    if (filters.maxChance !== undefined) {
      addWhere('COALESCE(upgrade.chance, 0) <= :maxChance', {
        maxChance: filters.maxChance,
      })
    }

    if (filters.minTargetPrice !== undefined) {
      addWhere('COALESCE(upgrade.skin_price, 0) >= :minTargetPrice', {
        minTargetPrice: filters.minTargetPrice,
      })
    }

    if (filters.maxTargetPrice !== undefined) {
      addWhere('COALESCE(upgrade.skin_price, 0) <= :maxTargetPrice', {
        maxTargetPrice: filters.maxTargetPrice,
      })
    }

    const search = filters.search?.trim()
    if (search) {
      addWhere(
        `(CAST(upgrade.id AS TEXT) ILIKE :search OR CAST(upgrade.user_id AS TEXT) ILIKE :search OR COALESCE(upgrade.skin_name, '') ILIKE :search OR COALESCE(user.display_name, '') ILIKE :search)`,
        { search: `%${search}%` },
      )
    }

    const [attempts, total] = await queryBuilder
      .orderBy('upgrade.created_at', 'DESC')
      .skip(pagination.skip)
      .take(pagination.limit)
      .getManyAndCount()

    return buildPaginatedResponse(
      attempts.map(attempt => this.toAdminAttempt(attempt)),
      total,
      pagination,
    )
  }

  async findAdminById(id: number): Promise<AdminUpgradeDetail> {
    const attempt = await this.entityManager
      .createQueryBuilder(UpgradeHistory, 'upgrade')
      .leftJoinAndSelect('upgrade.user', 'user')
      .where('upgrade.id = :id', { id })
      .getOne()

    if (!attempt) {
      throw new NotFoundException('Upgrade attempt not found')
    }

    const [targetImage, materials] = await Promise.all([
      this.lookupAdminSkinImage(attempt.skin_id, attempt.game_type),
      this.hydrateAdminMaterials(attempt.materials ?? [], attempt.game_type),
    ])

    return {
      ...this.toAdminAttempt(attempt, { targetImage }),
      materials,
    }
  }

  async performUpgrade(
    userId: number,
    upgradeDto: UpgradeDto,
  ): Promise<UpgradeResultDto> {
    const result = await this.entityManager.transaction(async manager => {
      // Pessimistic write lock. Without this, two concurrent upgrades from the
      // same user can both pass the balance / inventory checks and both
      // succeed — user pays once, rolls twice.
      const user = await manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      })

      if (!user) {
        throw new NotFoundException('User not found')
      }

      const mode: UpgradeMode = upgradeDto.use_balance
        ? 'balance'
        : 'inventory'

      // Default 'csgo' for clients that haven't been updated to send
      // game_type yet — preserves the existing CSGO upgrade behaviour
      // for old frontend builds while letting new ones target Dota.
      const gameType: UpgradeGameType = upgradeDto.game_type ?? 'csgo'

      let usedSkins: CsgoSkin[] = []
      let usedMaterials: UpgradeMaterialContext[] = []
      let targetSkin: CsgoSkin
      let chance: number
      let totalUsedPrice = 0

      if (upgradeDto.use_balance) {
        const result = await this.processBalanceUpgrade(
          manager,
          userId,
          user,
          upgradeDto,
          gameType,
        )
        targetSkin = result.targetSkin
        chance = result.chance
        totalUsedPrice = result.upgradeAmount
      } else {
        const result = await this.processInventoryUpgrade(
          manager,
          userId,
          upgradeDto,
          gameType,
        )
        usedSkins = result.usedSkins
        usedMaterials = result.usedMaterials
        targetSkin = result.targetSkin
        chance = result.chance
        totalUsedPrice = result.totalUsedPrice
      }

      const { success: isSuccess, roll } = this.rollUpgrade(chance)
      const created = isSuccess
        ? await this.createUpgradedSkin(manager, userId, targetSkin, gameType)
        : null

      const upgradeHistoryId = await this.recordHistory(manager, {
        userId,
        targetSkin,
        isSuccess,
        cost: totalUsedPrice,
        chance,
        mode,
        usedSkins,
        usedMaterials,
        gameType,
      })

      const houseEdgeBps = estimateUpgradeHouseEdgeBps({
        sourceAmount: totalUsedPrice,
        targetMarketPrice: Number(targetSkin.market_price),
        winChancePercent: chance,
      })
      const vipEarning = calculateFixedHouseEdgeVipEarning({
        sourceType: 'upgrade_attempt',
        wagerAmount: totalUsedPrice,
        houseEdgeBps,
      })

      await this.vipService.recordEarning(manager, user, {
        ...vipEarning,
        sourceId: `upgrade:${upgradeHistoryId}`,
        metadata: {
          gameType,
          mode,
          success: isSuccess,
          chance,
          roll,
          targetSkinId: targetSkin.id,
          targetMarketHashName: targetSkin.market_hash_name,
        },
      })

      // Single structured line per attempt — enough to debug "why did my
      // upgrade fail" support tickets without blowing up log volume.
      this.logger.log(
        `upgrade userId=${userId} mode=${mode} cost=${totalUsedPrice} chance=${chance} roll=${roll} success=${isSuccess} target_skin_id=${targetSkin.id}`,
      )

      const dto = this.buildUpgradeResultDto(
        isSuccess,
        created?.skin ?? null,
        created?.inventoryId ?? null,
        chance,
        roll,
        upgradeDto,
        user,
      )

      return {
        dto,
        challengeEvent: {
          gameType,
          mode,
          cost: totalUsedPrice,
          chance,
          success: isSuccess,
        },
      }
    })

    try {
      await this.clickerChallengesService.trackEvent(userId, {
        type: 'skin_upgrade',
        gameType: result.challengeEvent.gameType,
        mode: result.challengeEvent.mode,
        cost: result.challengeEvent.cost,
        chance: result.challengeEvent.chance,
        success: result.challengeEvent.success,
      })
    } catch (err) {
      this.logger.warn(
        `clicker challenge tracking failed for skin_upgrade user=${userId}: ${
          err instanceof Error ? err.message : err
        }`,
      )
    }

    return result.dto
  }

  private async processBalanceUpgrade(
    manager: EntityManager,
    userId: number,
    user: User,
    upgradeDto: UpgradeDto,
    gameType: UpgradeGameType,
  ): Promise<BalanceUpgradeContext> {
    // Presence + min(1) of `upgrade_amount` is enforced by the DTO via
    // `@ValidateIf(o => o.use_balance === true)`. The non-null cast below is
    // safe inside the `use_balance: true` branch.
    const upgradeAmount = upgradeDto.upgrade_amount as number

    // `[MIN_AMOUNT, MAX_AMOUNT]` is enforced by the DTO via `@Min/@Max` —
    // no need to re-check here. We only verify the user-specific constraint.
    if (Number(user.balance) < upgradeAmount) {
      throw new BadRequestException('Insufficient balance for upgrade')
    }

    const targetSkin = await this.loadTargetSkin(
      manager,
      upgradeDto.target_skin_id,
      gameType,
    )

    const targetPrice = Number(targetSkin.market_price)
    if (!targetSkin.market_price || targetPrice <= 0) {
      throw new BadRequestException('Target skin has invalid price')
    }

    const chance = this.calculateChanceByPrice(upgradeAmount, targetPrice)

    user.balance = Number(user.balance) - upgradeAmount
    await manager.save(user)

    return { targetSkin, chance, upgradeAmount }
  }

  /**
   * Load the upgrade target from the catalog matching the game.
   *
   * Returns CsgoSkin type for downstream compatibility — for Dota the
   * actual instance is a DotaSkin and gets cast through. Both entities
   * share the columns used downstream (id, market_hash_name,
   * market_price, image, quality), so consumers don't see any
   * runtime difference.
   */
  private async loadTargetSkin(
    manager: EntityManager,
    targetSkinId: number,
    gameType: UpgradeGameType,
  ): Promise<CsgoSkin> {
    if (gameType === 'dota') {
      const dotaSkin = await manager.findOne(DotaSkin, {
        where: { id: targetSkinId },
      })
      if (!dotaSkin) {
        throw new NotFoundException('Target skin not found')
      }
      return dotaSkin as unknown as CsgoSkin
    }

    const csgoSkin = await manager.findOne(CsgoSkin, {
      where: { id: targetSkinId },
    })
    if (!csgoSkin) {
      throw new NotFoundException('Target skin not found')
    }
    return csgoSkin
  }

  private async processInventoryUpgrade(
    manager: EntityManager,
    userId: number,
    upgradeDto: UpgradeDto,
    gameType: UpgradeGameType,
  ): Promise<InventoryUpgradeContext> {
    // Presence, min/max length, uniqueness of ids, and per-element shape are
    // enforced by the DTO via `@ValidateIf(o => o.use_balance !== true)` +
    // `@ArrayMinSize/@ArrayMaxSize/@ArrayUnique/@IsInt/@IsPositive`. The
    // non-null cast is safe inside the inventory branch.
    const inventorySkinIds = upgradeDto.inventory_skin_ids as number[]

    // Lock the rows so no concurrent upgrade / sell / withdrawal can touch
    // them between the check and the actual remove call.
    //
    // `setLock` with the third argument scopes `FOR UPDATE OF inv` to the
    // inventory table only — Postgres rejects plain `FOR UPDATE` when the
    // query joins the related `skin` table because the join is treated as
    // an outer join on a nullable side ("FOR UPDATE cannot be applied to
    // the nullable side of an outer join").
    const inventoryItems = await manager
      .createQueryBuilder(UserInventory, 'inv')
      .leftJoinAndSelect('inv.csgoSkin', 'csgoSkin')
      .leftJoinAndSelect('inv.dotaSkin', 'dotaSkin')
      .where('inv.id IN (:...ids)', { ids: inventorySkinIds })
      .andWhere('inv.user_id = :userId', { userId })
      .andWhere('inv.is_sold = false')
      .andWhere('inv.is_withdrawn = false')
      .setLock('pessimistic_write', undefined, ['inv'])
      .getMany()

    if (inventoryItems.length !== inventorySkinIds.length) {
      throw new NotFoundException(
        'Some skins not found in inventory or already used',
      )
    }

    const usedSkins: CsgoSkin[] = inventoryItems.map(
      // `inv.skin` is set by @AfterLoad on UserInventory; type-narrowed
      // to CsgoSkin for downstream compatibility (runtime is DotaSkin
      // for Dota inventory rows, sharing the columns we read).
      (item: UserInventory) => item.skin,
    )
    const usedMaterials: UpgradeMaterialContext[] = inventoryItems.map(
      (item: UserInventory) => ({
        skin: item.skin,
        gameType: item.game_type,
      }),
    )

    // Note: we do NOT dedupe by `csgo_skin.id` here. Two distinct
    // `UserInventory` rows pointing to the same skin (e.g. the user owns
    // 2× "AK-47 | Redline") are a legitimate stack and both should be
    // usable as materials. The DTO's `@ArrayUnique` already guarantees the
    // *inventory* ids in the request don't repeat, which is the only
    // constraint that matters.

    // Block "play a skin against itself": user can't sacrifice a copy of
    // skin X while also picking X as the target. Compares csgo_skin.id on
    // both sides — unlike the old `inventorySkinIds.includes(target_skin_id)`
    // which compared UserInventory.id to CsgoSkin.id and could trigger by
    // accident on numeric collisions. Owning another copy of the target
    // skin (not used as material) is fine — see commit history for the
    // dropped `userOwnsTargetSkin` check.
    if (
      inventoryItems.some(
        item =>
          item.game_type === gameType &&
          item.skin.id === upgradeDto.target_skin_id,
      )
    ) {
      throw new BadRequestException(
        'Target skin cannot be used as upgrade material',
      )
    }

    const invalidPriceSkins = usedSkins.filter(
      (skin: CsgoSkin) => !skin.market_price || Number(skin.market_price) <= 0,
    )
    if (invalidPriceSkins.length > 0) {
      throw new BadRequestException('Some skins have invalid or zero price')
    }

    const totalUsedPrice = usedSkins.reduce(
      (sum: number, skin: CsgoSkin) => sum + Number(skin.market_price),
      0,
    )

    // Σ material prices must fit the same envelope as `upgrade_amount` in
    // balance mode. DTO can't enforce this (it doesn't know prices), so we
    // check after summing.
    if (totalUsedPrice < UPGRADE_LIMITS.MIN_AMOUNT) {
      throw new BadRequestException(
        `Total material value must be at least ${UPGRADE_LIMITS.MIN_AMOUNT}`,
      )
    }
    if (totalUsedPrice > UPGRADE_LIMITS.MAX_AMOUNT) {
      throw new BadRequestException(
        `Total material value must not exceed ${UPGRADE_LIMITS.MAX_AMOUNT}`,
      )
    }

    const targetSkin = await this.loadTargetSkin(
      manager,
      upgradeDto.target_skin_id,
      gameType,
    )

    const targetPrice = Number(targetSkin.market_price)
    if (!targetSkin.market_price || targetPrice <= 0) {
      throw new BadRequestException('Target skin has invalid price')
    }

    await manager.remove(UserInventory, inventoryItems)

    const chance = this.calculateChanceByPrice(totalUsedPrice, targetPrice)

    return { usedSkins, usedMaterials, targetSkin, chance, totalUsedPrice }
  }

  // Returns both the boolean outcome AND the actual rolled value so the
  // frontend can stop the wheel pointer at the exact percentage. `roll` is
  // rounded to two decimals for stable display and to match the precision
  // used everywhere else (`chance`, prices).
  private rollUpgrade(chance: number): { success: boolean; roll: number } {
    const raw = Math.random() * 100
    const roll = Math.round(raw * 100) / 100

    return { success: roll < chance, roll }
  }

  private async createUpgradedSkin(
    manager: EntityManager,
    userId: number,
    targetSkin: CsgoSkin,
    gameType: UpgradeGameType,
  ): Promise<{ skin: CsgoSkin; inventoryId: number }> {
    // Polymorphic insert — populate exactly one of csgo_skin_id /
    // dota_skin_id (XOR check on user_inventory enforces this at the
    // DB level). The `case` relation is null because upgrade-won skins
    // didn't come from a case open.
    const newInventoryItem = manager.create(UserInventory, {
      user: { id: userId },
      game_type: gameType,
      csgo_skin_id: gameType === 'csgo' ? targetSkin.id : null,
      dota_skin_id: gameType === 'dota' ? targetSkin.id : null,
      obtained_at: new Date(),
      is_sold: false,
      is_withdrawn: false,
    })

    const saved = await manager.save(newInventoryItem)
    return { skin: targetSkin, inventoryId: saved.id }
  }

  // Picks the most representative "old" rarity for the history row. Falls back
  // to a sentinel if data is missing — never lets a NULL/empty/over-long
  // string crash the INSERT into a non-null varchar(50) column.
  private pickOldRarity(usedSkins: readonly CsgoSkin[]): string {
    if (usedSkins.length === 0) {
      return BALANCE_RARITY
    }

    const mostExpensive = usedSkins.reduce((top, skin) =>
      Number(skin.market_price) > Number(top.market_price) ? skin : top,
    )

    return this.safeSkinRarity(mostExpensive)
  }

  private safeSkinRarity(skin: CsgoSkin): string {
    const skinWithDotaRarity = skin as CsgoSkin & { rarity?: string | null }

    return this.safeRarity(skin.quality ?? skinWithDotaRarity.rarity)
  }

  private safeRarity(raw: string | null | undefined): string {
    if (!raw || typeof raw !== 'string' || raw.trim() === '') {
      return UNKNOWN_RARITY
    }

    return raw.slice(0, RARITY_COLUMN_LIMIT)
  }

  // Persisted inside the same transaction as the upgrade itself, so a rollback
  // discards the history rows too. Stores enough metadata that the history
  // page can render a row without re-querying the source skins.
  private async recordHistory(
    manager: EntityManager,
    params: {
      userId: number
      targetSkin: CsgoSkin
      isSuccess: boolean
      cost: number
      chance: number
      mode: UpgradeMode
      usedSkins: readonly CsgoSkin[]
      usedMaterials: readonly UpgradeMaterialContext[]
      gameType: UpgradeGameType
    },
  ): Promise<number> {
    const {
      userId,
      targetSkin,
      isSuccess,
      cost,
      chance,
      mode,
      usedSkins,
      usedMaterials,
      gameType,
    } = params

    const oldRarity =
      mode === 'balance' ? BALANCE_RARITY : this.pickOldRarity(usedSkins)
    const newRarity = isSuccess
      ? this.safeSkinRarity(targetSkin)
      : FAILED_RARITY

    const materials: UpgradeHistoryMaterial[] = usedMaterials.map(material => ({
      skin_id: material.skin.id,
      name: material.skin.market_hash_name,
      rarity: this.safeSkinRarity(material.skin),
      price: Number(material.skin.market_price),
      game_type: material.gameType,
    }))

    const upgradeHistory = manager.create(UpgradeHistory, {
      user_id: userId,
      skin_id: targetSkin.id,
      game_type: gameType,
      skin_name: targetSkin.market_hash_name.slice(0, 100),
      skin_price: Number(targetSkin.market_price),
      old_rarity: oldRarity,
      new_rarity: newRarity,
      cost,
      success: isSuccess,
      chance,
      mode,
      materials: materials.length > 0 ? materials : null,
    })
    const savedUpgradeHistory = await manager.save(upgradeHistory)

    const userHistory = manager.create(UserHistory, {
      user_id: userId,
      action: HistoryAction.UPGRADE_SKIN,
      related_table: 'upgrade_history',
      related_id: savedUpgradeHistory.id,
    })
    await manager.save(userHistory)

    return savedUpgradeHistory.id
  }

  private toAdminAttempt(
    attempt: UpgradeHistory,
    options: { targetImage?: string | null } = {},
  ): AdminUpgradeAttempt {
    const cost = Number(attempt.cost)
    const targetPrice =
      attempt.skin_price !== null ? Number(attempt.skin_price) : 0
    const success = attempt.success ?? false
    const payout = success ? targetPrice : 0

    return {
      chance: attempt.chance !== null ? Number(attempt.chance) : 0,
      cost,
      created_at: attempt.created_at,
      game_type: attempt.game_type,
      id: attempt.id,
      mode: attempt.mode ?? 'inventory',
      multiplier: cost > 0 ? this.roundMoney(targetPrice / cost) : 0,
      payout,
      project_profit: this.roundMoney(cost - payout),
      success,
      target: {
        id: attempt.skin_id,
        image: options.targetImage,
        name: attempt.skin_name,
        price: targetPrice,
        rarity: attempt.new_rarity,
      },
      user: {
        avatar: attempt.user?.avatar ?? null,
        display_name: attempt.user?.display_name ?? `User #${attempt.user_id}`,
        id: attempt.user_id,
      },
    }
  }

  private async lookupAdminSkinImage(
    skinId: number,
    gameType: UpgradeGameType | null | undefined,
  ): Promise<string | null> {
    if (gameType === 'dota') {
      const skin = await this.entityManager.findOne(DotaSkin, {
        where: { id: skinId },
        select: ['id', 'image'],
      })

      return skin?.image ?? null
    }

    const skin = await this.entityManager.findOne(CsgoSkin, {
      where: { id: skinId },
      select: ['id', 'image'],
    })

    return skin?.image ?? null
  }

  private async hydrateAdminMaterials(
    materials: readonly UpgradeHistoryMaterial[],
    fallbackGameType: UpgradeGameType,
  ): Promise<AdminUpgradeMaterial[]> {
    return Promise.all(
      materials.map(async material => {
        const gameType = material.game_type ?? fallbackGameType

        return {
          game_type: gameType,
          image: await this.lookupAdminSkinImage(material.skin_id, gameType),
          name: material.name,
          price: Number(material.price),
          rarity: material.rarity,
          skin_id: material.skin_id,
        }
      }),
    )
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100
  }

  private toNumber(value: string | number | null | undefined): number {
    const parsed = Number(value)

    return Number.isFinite(parsed) ? parsed : 0
  }

  private buildUpgradeResultDto(
    isSuccess: boolean,
    upgradedSkin: CsgoSkin | null,
    upgradedInventoryId: number | null,
    chance: number,
    roll: number,
    upgradeDto: UpgradeDto,
    user: User,
  ): UpgradeResultDto {
    return {
      success: isSuccess,
      upgraded_skin: upgradedSkin ?? undefined,
      upgraded_inventory_id: upgradedInventoryId ?? undefined,
      chance,
      roll,
      new_balance: upgradeDto.use_balance ? Number(user.balance) : undefined,
    }
  }

  // Mirrors the frontend's `calculateWinChance`: source/target ratio with
  // the upgrade house return applied, then bounded by `[MIN_CHANCE,
  // MAX_CHANCE]`. Both edges
  // throw 400 — out-of-bounds targets are filtered out on the frontend
  // already (`MarketSection.isCardDisabled`), so reaching this branch means
  // either a stale UI or a hand-crafted request.
  private calculateChanceByPrice(
    usedPrice: number,
    targetPrice: number,
  ): number {
    if (targetPrice <= 0) {
      throw new BadRequestException('Target price must be greater than zero')
    }

    if (usedPrice <= 0) {
      throw new BadRequestException('Used price must be greater than zero')
    }

    const chance = calculateUpgradeChanceByPrice(usedPrice, targetPrice)

    if (chance < UPGRADE_LIMITS.MIN_CHANCE) {
      throw new BadRequestException(
        `Chance ${chance}% is below the minimum allowed (${UPGRADE_LIMITS.MIN_CHANCE}%) — pick a cheaper target`,
      )
    }
    if (chance > UPGRADE_LIMITS.MAX_CHANCE) {
      throw new BadRequestException(
        `Chance ${chance}% is above the maximum allowed (${UPGRADE_LIMITS.MAX_CHANCE}%) — pick a more expensive target`,
      )
    }

    return chance
  }

  getLimits(): UpgradeLimitsDto {
    return {
      min_chance: UPGRADE_LIMITS.MIN_CHANCE,
      max_chance: UPGRADE_LIMITS.MAX_CHANCE,
      min_amount: UPGRADE_LIMITS.MIN_AMOUNT,
      max_amount: UPGRADE_LIMITS.MAX_AMOUNT,
      min_materials: UPGRADE_LIMITS.MIN_MATERIALS,
      max_materials: UPGRADE_LIMITS.MAX_MATERIALS,
      house_return: UPGRADE_HOUSE_RETURN,
    }
  }
}
