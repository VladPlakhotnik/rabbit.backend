import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, In } from 'typeorm'
import { UserInventory, GameType } from './userInventory.entity'
import { User } from '../users/user.entity'
import { Case } from '../cases/case.entity'
import { ClickerCase } from '../clickerCase/entities/clicker_case.entity'
import { CsgoSkin } from '../skins/csgo-skin.entity'
import { DotaSkin } from '../skins/dota-skin.entity'

export interface SoldItem {
  id: number
  skin: {
    id: number
    name: string
    img_url: string
    rarity: string
    skin_price: number
  }
  obtained_at: Date
  is_sold: boolean
}

interface SellAllResult {
  soldItems: SoldItem[]
  updatedBalance: number
}

interface SellSelectedResult {
  soldItems: SoldItem[]
  updatedBalance: number
}

/**
 * Service for working with user inventory
 * @class UserInventoryService
 */

@Injectable()
export class UserInventoryService {
  private readonly logger = new Logger(UserInventoryService.name)

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserInventory)
    private readonly userInventoryRepository: Repository<UserInventory>,
  ) {}

  async getUserInventory(
    userId: number,
    filters?: {
      search?: string
      maxPrice?: number
      excludeSold?: boolean
      excludeWithdrawn?: boolean
    },
  ): Promise<UserInventory[]> {
    try {
      if (!userId) {
        throw new BadRequestException('User ID is required')
      }

      // Use a query builder so we can mix scalar filters with a `LIKE` over
      // the joined skin tables — `find({ where: {...} })` doesn't compose
      // those well in TypeORM. Default behavior (no filters) still returns
      // the full inventory so other pages keep working.
      //
      // Polymorphism: an inventory row points at exactly one of
      // csgoSkin / dotaSkin (XOR). We left-join both; the @AfterLoad
      // hook on UserInventory then exposes a unified `skin` getter so
      // callers don't need to know which game it is.
      const query = this.userInventoryRepository
        .createQueryBuilder('inv')
        .leftJoinAndSelect('inv.csgoSkin', 'csgoSkin')
        .leftJoinAndSelect('inv.dotaSkin', 'dotaSkin')
        .where('inv.user_id = :userId', { userId })

      if (filters?.excludeSold) {
        query.andWhere('inv.is_sold = false')
      }

      if (filters?.excludeWithdrawn) {
        query.andWhere('inv.is_withdrawn = false')
      }

      if (filters?.search && filters.search.trim() !== '') {
        // Case-insensitive substring on whichever skin column is non-null
        // for the row. The unmatched side is null, so its ILIKE evaluates
        // to NULL → false in OR, which is what we want.
        query.andWhere(
          '(csgoSkin.market_hash_name ILIKE :search OR dotaSkin.market_hash_name ILIKE :search)',
          { search: `%${filters.search.trim()}%` },
        )
      }

      if (
        filters?.maxPrice !== undefined &&
        Number.isFinite(filters.maxPrice) &&
        filters.maxPrice > 0
      ) {
        query.andWhere(
          '(csgoSkin.market_price <= :maxPrice OR dotaSkin.market_price <= :maxPrice)',
          { maxPrice: filters.maxPrice },
        )
      }

      query.orderBy('inv.obtained_at', 'DESC')

      return await query.getMany()
    } catch (error: unknown) {
      this.logger.error(
        `Error getting inventory for user ${userId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
      throw error
    }
  }

  async sellSkin(inventoryId: number, userId: number): Promise<UserInventory> {
    if (!inventoryId || !userId) {
      throw new BadRequestException('Inventory ID and User ID are required')
    }

    // Run inside a transaction with row-level locks so a double-click on
    // Sell can't credit the user twice. Without this, two parallel reads
    // both see `is_sold: false` and both add the price to the balance — the
    // first save wins on `is_sold`, but `balance` is incremented twice.
    return this.userInventoryRepository.manager.transaction(async manager => {
      try {
        const user = await manager.findOne(User, {
          where: { id: userId },
          lock: { mode: 'pessimistic_write' },
        })

        if (!user) {
          throw new NotFoundException('User not found')
        }

        // `setLock` with the third argument scopes `FOR UPDATE OF inv` to the
        // inventory table only — Postgres rejects plain `FOR UPDATE` when the
        // query joins related tables ("FOR UPDATE cannot be applied to the
        // nullable side of an outer join").
        const inventoryItem = await manager
          .createQueryBuilder(UserInventory, 'inv')
          .leftJoinAndSelect('inv.csgoSkin', 'csgoSkin')
          .leftJoinAndSelect('inv.dotaSkin', 'dotaSkin')
          .leftJoinAndSelect('inv.user', 'user')
          .where('inv.id = :id', { id: inventoryId })
          .setLock('pessimistic_write', undefined, ['inv'])
          .getOne()

        if (!inventoryItem) {
          throw new NotFoundException('Inventory item not found')
        }

        if (inventoryItem.user.id !== userId) {
          throw new BadRequestException('You do not own this item')
        }

        if (inventoryItem.is_sold) {
          throw new BadRequestException('Item has already been sold')
        }

        if (inventoryItem.is_withdrawn) {
          throw new BadRequestException('Cannot sell a withdrawn item')
        }

        const skinPrice = Number(inventoryItem.skin.market_price)
        user.balance = Number(user.balance) + skinPrice
        await manager.save(user)

        inventoryItem.is_sold = true
        // Reflect the locked-and-updated balance on the returned entity so
        // the controller can serialize the post-sell value.
        inventoryItem.user = user
        await manager.save(inventoryItem)

        return inventoryItem
      } catch (error: unknown) {
        this.logger.error(
          `Error selling skin ${inventoryId} for user ${userId}: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        )
        throw error
      }
    })
  }

  async sellAllSkins(userId: number): Promise<SellAllResult> {
    try {
      if (!userId) {
        throw new BadRequestException('User ID is required')
      }

      const user = await this.userRepository.findOne({
        where: { id: userId },
        relations: ['inventories'],
      })

      if (!user) {
        throw new NotFoundException('User not found')
      }

      const unsoldSkins = await this.userInventoryRepository.find({
        where: { user: { id: userId }, is_sold: false, is_withdrawn: false },
        relations: ['csgoSkin', 'dotaSkin'],
      })

      if (unsoldSkins.length === 0) {
        throw new BadRequestException('You dont have skins for sell')
      }

      const soldItems = await Promise.all(
        unsoldSkins.map(async item => {
          item.is_sold = true
          await this.userInventoryRepository.save(item)

          return {
            id: item.id,
            skin: {
              id: item.skin.id,
              name: item.skin.market_hash_name,
              img_url: item.skin.image,
              rarity: item.skin.quality,
              skin_price: item.skin.market_price,
            },
            obtained_at: item.obtained_at,
            is_sold: item.is_sold,
          }
        }),
      )

      const totalSellPrice = unsoldSkins.reduce(
        (sum, item) => sum + Number(item.skin.market_price),
        0,
      )

      user.balance = user.balance + totalSellPrice
      await this.userRepository.save(user)

      return {
        soldItems,
        updatedBalance: user.balance,
      }
    } catch (error: unknown) {
      this.logger.error(
        `Error selling all skins for user ${userId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
      throw error
    }
  }

  /**
   * Create an inventory row for a skin won from a case.
   *
   * Polymorphic: takes `gameType` to decide whether the skin lands in
   * the CSGO or Dota FK column. @AfterLoad doesn't fire on save (it's
   * a load-only TypeORM lifecycle hook), so we manually populate the
   * unified `skin` getter on the returned entity for callers that want
   * to read it without re-fetching.
   */
  async createInventory(
    userId: number,
    skin: CsgoSkin | DotaSkin,
    gameType: GameType,
    caseEntity: Case,
  ): Promise<UserInventory> {
    return this.userInventoryRepository.manager.transaction(async manager => {
      const inventory = manager.create(UserInventory, {
        user: { id: userId },
        game_type: gameType,
        // Set exactly one of the two FK columns. The XOR check at the
        // DB level enforces this; the ternary below makes it explicit.
        csgo_skin_id: gameType === 'csgo' ? skin.id : null,
        dota_skin_id: gameType === 'dota' ? skin.id : null,
        case: caseEntity,
        clickerCase: null,
        obtained_at: new Date(),
        is_sold: false,
        is_withdrawn: false,
        withdrawn_at: null,
      })
      const saved = await manager.save(inventory)
      // Surface the freshly-saved skin on the unified getter so
      // downstream callers (publishLiveDrop, history dump) don't need
      // to re-load. `skin` is typed CsgoSkin on the entity for
      // downstream compatibility — see UserInventory.skin docstring.
      saved.skin = skin as unknown as CsgoSkin
      if (gameType === 'csgo') {
        saved.csgoSkin = skin as CsgoSkin
      } else {
        saved.dotaSkin = skin as DotaSkin
      }
      return saved
    })
  }

  /**
   * Inventory row for a skin won from a clicker (carrot-priced) case.
   * Same shape as {@link createInventory} but writes `clicker_case_id`
   * instead of `case_id`. Currently only supports CSGO skins — clicker
   * cases don't pull from the Dota pool yet.
   */
  async createInventoryFromClickerCase(
    userId: number,
    skin: CsgoSkin,
    clickerCase: ClickerCase,
  ): Promise<UserInventory> {
    return this.userInventoryRepository.manager.transaction(async manager => {
      const inventory = manager.create(UserInventory, {
        user: { id: userId },
        game_type: 'csgo' as GameType,
        csgo_skin_id: skin.id,
        dota_skin_id: null,
        case: null,
        clickerCase,
        obtained_at: new Date(),
        is_sold: false,
        is_withdrawn: false,
        withdrawn_at: null,
      })
      const saved = await manager.save(inventory)
      saved.skin = skin
      saved.csgoSkin = skin
      return saved
    })
  }

  async createInventoryFromReward(
    userId: number,
    skin: CsgoSkin | DotaSkin,
    gameType: GameType,
  ): Promise<UserInventory> {
    return this.userInventoryRepository.manager.transaction(async manager => {
      const inventory = manager.create(UserInventory, {
        user: { id: userId },
        game_type: gameType,
        csgo_skin_id: gameType === 'csgo' ? skin.id : null,
        dota_skin_id: gameType === 'dota' ? skin.id : null,
        case: null,
        clickerCase: null,
        obtained_at: new Date(),
        is_sold: false,
        is_withdrawn: false,
        withdrawn_at: null,
      })
      const saved = await manager.save(inventory)
      saved.skin = skin as unknown as CsgoSkin
      if (gameType === 'csgo') {
        saved.csgoSkin = skin as CsgoSkin
      } else {
        saved.dotaSkin = skin as DotaSkin
      }
      return saved
    })
  }

  async sellSelectedSkins(
    inventoryIds: number[],
    userId: number,
  ): Promise<SellSelectedResult> {
    return this.userInventoryRepository.manager.transaction(async manager => {
      try {
        if (!inventoryIds || inventoryIds.length === 0) {
          throw new BadRequestException('Inventory IDs are required')
        }

        if (!userId) {
          throw new BadRequestException('User ID is required')
        }

        const user = await manager.findOne(User, {
          where: { id: userId },
        })

        if (!user) {
          throw new NotFoundException('User not found')
        }

        const inventoryItems = await manager.find(UserInventory, {
          where: { id: In(inventoryIds) },
          relations: ['csgoSkin', 'dotaSkin', 'user'],
        })

        if (inventoryItems.length === 0) {
          throw new NotFoundException('No inventory items found')
        }

        // Проверяем, что все предметы принадлежат пользователю
        for (const item of inventoryItems) {
          if (item.user.id !== userId) {
            throw new BadRequestException('You do not own one or more items')
          }
          if (item.is_sold) {
            throw new BadRequestException(
              'One or more items have already been sold',
            )
          }
          if (item.is_withdrawn) {
            throw new BadRequestException('Cannot sell withdrawn items')
          }
        }

        // Подготавливаем данные для возврата
        const soldItems = inventoryItems.map(item => ({
          id: item.id,
          skin: {
            id: item.skin.id,
            name: item.skin.market_hash_name,
            img_url: item.skin.image,
            rarity: item.skin.quality,
            skin_price: item.skin.market_price,
          },
          obtained_at: item.obtained_at,
          is_sold: true,
        }))

        // Обновляем все предметы одним запросом
        await manager.update(
          UserInventory,
          { id: In(inventoryIds) },
          { is_sold: true },
        )

        // Вычисляем общую стоимость
        const totalSellPrice = inventoryItems.reduce(
          (sum, item) => sum + Number(item.skin.market_price),
          0,
        )

        // Обновляем баланс пользователя
        user.balance = user.balance + totalSellPrice
        await manager.save(user)

        return {
          soldItems,
          updatedBalance: user.balance,
        }
      } catch (error: unknown) {
        this.logger.error(
          `Error selling selected skins for user ${userId}: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        )
        throw error
      }
    })
  }
}
