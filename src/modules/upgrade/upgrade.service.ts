import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, EntityManager } from 'typeorm'
import { User } from '../users/user.entity'
import { UserInventory } from '../userInventory/userInventory.entity'
import { UpgradeDto } from './dto/upgrade.dto'
import { CsgoSkin } from '../skins/csgo-skin.entity'
import {
  UpgradeHistory,
  UpgradeHistoryMaterial,
  UpgradeMode,
} from '../userHistory/entities/upgrade-history.entity'
import { UserHistory } from '../userHistory/userHistory.entity'
import { HistoryAction } from '../userHistory/enums/history-action.enum'

const MIN_UPGRADE_AMOUNT = 1
const MIN_SKINS_FOR_UPGRADE = 1
const MAX_SKINS_FOR_UPGRADE = 50
const MAX_CHANCE = 100
const RARITY_COLUMN_LIMIT = 50
// Sentinels stored in `old_rarity` / `new_rarity` for cases where there is no
// real rarity to record (balance-mode source, failed roll).
const BALANCE_RARITY = 'balance'
const FAILED_RARITY = 'failed'
const UNKNOWN_RARITY = 'unknown'

interface UpgradeResult {
  success: boolean
  upgraded_skin?: CsgoSkin
  // ID of the freshly created `user_inventory` row. Frontend needs this to
  // wire the Sell button — selling is by inventory id, not by skin id.
  upgraded_inventory_id?: number
  chance: number
  // Actual random value rolled against `chance` (0..100). Frontend uses this
  // to stop the wheel pointer at the exact percentage that came up — so a
  // chance=50 / roll=70 attempt visibly lands on 70% in the lose zone,
  // instead of somewhere random inside the lose arc.
  roll: number
  new_balance?: number
}

interface BalanceUpgradeContext {
  targetSkin: CsgoSkin
  chance: number
}

interface InventoryUpgradeContext {
  usedSkins: CsgoSkin[]
  targetSkin: CsgoSkin
  chance: number
  totalUsedPrice: number
}

@Injectable()
export class UpgradeService {
  private readonly logger = new Logger(UpgradeService.name)

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async performUpgrade(
    userId: number,
    upgradeDto: UpgradeDto,
  ): Promise<UpgradeResult> {
    return this.userRepository.manager.transaction(async manager => {
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

      let usedSkins: CsgoSkin[] = []
      let targetSkin: CsgoSkin
      let chance: number
      let totalUsedPrice = 0

      if (upgradeDto.use_balance) {
        const result = await this.processBalanceUpgrade(
          manager,
          userId,
          user,
          upgradeDto,
        )
        targetSkin = result.targetSkin
        chance = result.chance
        totalUsedPrice = upgradeDto.upgrade_amount ?? 0
      } else {
        const result = await this.processInventoryUpgrade(
          manager,
          userId,
          upgradeDto,
        )
        usedSkins = result.usedSkins
        targetSkin = result.targetSkin
        chance = result.chance
        totalUsedPrice = result.totalUsedPrice
      }

      const { success: isSuccess, roll } = this.rollUpgrade(chance)
      const created = isSuccess
        ? await this.createUpgradedSkin(manager, userId, targetSkin)
        : null

      await this.recordHistory(manager, {
        userId,
        targetSkin,
        isSuccess,
        cost: totalUsedPrice,
        chance,
        mode,
        usedSkins,
      })

      // Single structured line per attempt — enough to debug "why did my
      // upgrade fail" support tickets without blowing up log volume.
      this.logger.log(
        `upgrade userId=${userId} mode=${mode} cost=${totalUsedPrice} chance=${chance} roll=${roll} success=${isSuccess} target_skin_id=${targetSkin.id}`,
      )

      return this.buildUpgradeResult(
        isSuccess,
        created?.skin ?? null,
        created?.inventoryId ?? null,
        chance,
        roll,
        upgradeDto,
        user,
      )
    })
  }

  private async processBalanceUpgrade(
    manager: EntityManager,
    userId: number,
    user: User,
    upgradeDto: UpgradeDto,
  ): Promise<BalanceUpgradeContext> {
    if (!upgradeDto.upgrade_amount) {
      throw new BadRequestException(
        'upgrade_amount is required when using balance',
      )
    }

    if (upgradeDto.upgrade_amount < MIN_UPGRADE_AMOUNT) {
      throw new BadRequestException(
        `Minimum upgrade amount is ${MIN_UPGRADE_AMOUNT}`,
      )
    }

    if (Number(user.balance) < upgradeDto.upgrade_amount) {
      throw new BadRequestException('Insufficient balance for upgrade')
    }

    const targetSkin = await manager.findOne(CsgoSkin, {
      where: { id: upgradeDto.target_skin_id },
    })

    if (!targetSkin) {
      throw new NotFoundException('Target skin not found')
    }

    const targetPrice = Number(targetSkin.market_price)
    if (!targetSkin.market_price || targetPrice <= 0) {
      throw new BadRequestException('Target skin has invalid price')
    }

    if (
      await this.userOwnsTargetSkin(manager, userId, upgradeDto.target_skin_id)
    ) {
      throw new BadRequestException(
        'You already have this skin in your inventory',
      )
    }

    const chance = this.calculateChanceByPrice(
      upgradeDto.upgrade_amount,
      targetPrice,
    )

    user.balance = Number(user.balance) - upgradeDto.upgrade_amount
    await manager.save(user)

    return { targetSkin, chance }
  }

  private async processInventoryUpgrade(
    manager: EntityManager,
    userId: number,
    upgradeDto: UpgradeDto,
  ): Promise<InventoryUpgradeContext> {
    if (
      !upgradeDto.inventory_skin_ids ||
      upgradeDto.inventory_skin_ids.length === 0
    ) {
      throw new BadRequestException(
        'Inventory skin IDs are required when not using balance',
      )
    }

    if (upgradeDto.inventory_skin_ids.length < MIN_SKINS_FOR_UPGRADE) {
      throw new BadRequestException(
        `Minimum ${MIN_SKINS_FOR_UPGRADE} skin(s) required for upgrade`,
      )
    }

    if (upgradeDto.inventory_skin_ids.length > MAX_SKINS_FOR_UPGRADE) {
      throw new BadRequestException(
        `Maximum ${MAX_SKINS_FOR_UPGRADE} skins allowed for upgrade`,
      )
    }

    if (upgradeDto.inventory_skin_ids.includes(upgradeDto.target_skin_id)) {
      throw new BadRequestException(
        'Target skin cannot be used as upgrade material',
      )
    }

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
      .leftJoinAndSelect('inv.skin', 'skin')
      .where('inv.id IN (:...ids)', {
        ids: upgradeDto.inventory_skin_ids,
      })
      .andWhere('inv.user_id = :userId', { userId })
      .andWhere('inv.is_sold = false')
      .andWhere('inv.is_withdrawn = false')
      .setLock('pessimistic_write', undefined, ['inv'])
      .getMany()

    if (inventoryItems.length !== upgradeDto.inventory_skin_ids.length) {
      throw new NotFoundException(
        'Some skins not found in inventory or already used',
      )
    }

    const usedSkins: CsgoSkin[] = inventoryItems.map(
      (item: UserInventory) => item.skin,
    )

    const uniqueSkinIds = new Set(usedSkins.map((skin: CsgoSkin) => skin.id))
    if (uniqueSkinIds.size !== usedSkins.length) {
      throw new BadRequestException(
        'Cannot use multiple instances of the same skin for upgrade',
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

    const targetSkin = await manager.findOne(CsgoSkin, {
      where: { id: upgradeDto.target_skin_id },
    })

    if (!targetSkin) {
      throw new NotFoundException('Target skin not found')
    }

    const targetPrice = Number(targetSkin.market_price)
    if (!targetSkin.market_price || targetPrice <= 0) {
      throw new BadRequestException('Target skin has invalid price')
    }

    if (
      await this.userOwnsTargetSkin(manager, userId, upgradeDto.target_skin_id)
    ) {
      throw new BadRequestException(
        'You already have this skin in your inventory',
      )
    }

    await manager.remove(UserInventory, inventoryItems)

    const chance = this.calculateChanceByPrice(totalUsedPrice, targetPrice)

    return { usedSkins, targetSkin, chance, totalUsedPrice }
  }

  private async userOwnsTargetSkin(
    manager: EntityManager,
    userId: number,
    targetSkinId: number,
  ): Promise<boolean> {
    const existing = await manager.findOne(UserInventory, {
      where: {
        user: { id: userId },
        skin: { id: targetSkinId },
        is_sold: false,
        is_withdrawn: false,
      },
    })

    return existing !== null
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
  ): Promise<{ skin: CsgoSkin; inventoryId: number }> {
    const newInventoryItem = manager.create(UserInventory, {
      user: { id: userId },
      skin: targetSkin,
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

    return this.safeRarity(mostExpensive.quality)
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
    },
  ): Promise<void> {
    const { userId, targetSkin, isSuccess, cost, chance, mode, usedSkins } =
      params

    const oldRarity =
      mode === 'balance' ? BALANCE_RARITY : this.pickOldRarity(usedSkins)
    const newRarity = isSuccess
      ? this.safeRarity(targetSkin.quality)
      : FAILED_RARITY

    const materials: UpgradeHistoryMaterial[] = usedSkins.map(skin => ({
      skin_id: skin.id,
      name: skin.market_hash_name,
      rarity: this.safeRarity(skin.quality),
      price: Number(skin.market_price),
    }))

    const upgradeHistory = manager.create(UpgradeHistory, {
      user_id: userId,
      skin_id: targetSkin.id,
      skin_name: targetSkin.market_hash_name.slice(0, 100),
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
  }

  private buildUpgradeResult(
    isSuccess: boolean,
    upgradedSkin: CsgoSkin | null,
    upgradedInventoryId: number | null,
    chance: number,
    roll: number,
    upgradeDto: UpgradeDto,
    user: User,
  ): UpgradeResult {
    return {
      success: isSuccess,
      upgraded_skin: upgradedSkin ?? undefined,
      upgraded_inventory_id: upgradedInventoryId ?? undefined,
      chance,
      roll,
      new_balance: upgradeDto.use_balance ? Number(user.balance) : undefined,
    }
  }

  // Mirrors the frontend's `calculateWinChance`: linear ratio of used to target
  // price, clamped to [0..100]. Downgrades (used >= target) are rejected here,
  // matching the frontend's `MarketSection.isCardDisabled` rule.
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

    if (usedPrice >= targetPrice) {
      throw new BadRequestException(
        'Target skin must be more expensive than the upgrade material',
      )
    }

    const chance = (usedPrice / targetPrice) * MAX_CHANCE
    const clamped = Math.min(MAX_CHANCE, Math.max(0, chance))

    return Math.round(clamped * 100) / 100
  }
}
