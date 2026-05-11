import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { DataSource, EntityManager } from 'typeorm'
import { User } from '../users/user.entity'
import { UserInventory, GameType } from '../userInventory/userInventory.entity'
import { CsgoSkin } from './csgo-skin.entity'
import { DotaSkin } from './dota-skin.entity'
import { MAX_SKINS_PER_PURCHASE } from './dto/buy-skins.dto'
import { SkinStatus } from './shared/skin-status.enum'

type PurchasableSkin = CsgoSkin | DotaSkin

interface BuySkinsInput {
  skinIds: number[]
  gameType: GameType
}

interface BuySkinsResult {
  success: true
  inventory: UserInventory[]
  totalPrice: number
  updatedBalance: number
}

const toCents = (value: number | null | undefined): number =>
  Math.round(Number(value ?? 0) * 100)

const getStockAmount = (skin: PurchasableSkin): number => {
  const raw = skin.amount_in_market ?? ''
  const parsed = Number.parseInt(String(raw).trim(), 10)

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

@Injectable()
export class SkinPurchaseService {
  constructor(private readonly dataSource: DataSource) {}

  async buySkins(userId: number, input: BuySkinsInput): Promise<BuySkinsResult> {
    if (!userId) {
      throw new BadRequestException('User is required')
    }

    if (input.skinIds.length > MAX_SKINS_PER_PURCHASE) {
      throw new BadRequestException(
        `Cannot buy more than ${MAX_SKINS_PER_PURCHASE} skins at once`,
      )
    }

    const skinCounts = this.getSkinCounts(input.skinIds)
    const uniqueSkinIds = [...skinCounts.keys()]

    if (uniqueSkinIds.length === 0) {
      throw new BadRequestException('At least one skin is required')
    }

    return this.dataSource.transaction(async manager => {
      const user = await manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      })

      if (!user) {
        throw new NotFoundException('User not found')
      }

      const skins = await this.findLockedSkins(
        manager,
        input.gameType,
        uniqueSkinIds,
      )

      if (skins.length !== uniqueSkinIds.length) {
        throw new NotFoundException('One or more skins were not found')
      }

      const totalCents = skins.reduce((sum, skin) => {
        const requestedCount = skinCounts.get(skin.id) ?? 0
        this.assertSkinCanBePurchased(skin, requestedCount)

        return sum + toCents(skin.market_price) * requestedCount
      }, 0)

      const balanceCents = toCents(user.balance)
      if (balanceCents < totalCents) {
        throw new BadRequestException('Insufficient balance')
      }

      user.balance = (balanceCents - totalCents) / 100
      await manager.save(user)

      for (const skin of skins) {
        const requestedCount = skinCounts.get(skin.id) ?? 0
        skin.amount_in_market = String(getStockAmount(skin) - requestedCount)
      }
      await manager.save(skins)

      const inventoryRows = skins.flatMap(skin => {
        const requestedCount = skinCounts.get(skin.id) ?? 0

        return Array.from({ length: requestedCount }, () =>
          manager.create(UserInventory, {
            user: { id: userId } as User,
            game_type: input.gameType,
            csgo_skin_id: input.gameType === 'csgo' ? skin.id : null,
            dota_skin_id: input.gameType === 'dota' ? skin.id : null,
            case: null,
            clickerCase: null,
            obtained_at: new Date(),
            is_sold: false,
            is_withdrawn: false,
            withdrawn_at: null,
          }),
        )
      })

      const inventory = await manager.save(inventoryRows)
      const skinById = new Map(skins.map(skin => [skin.id, skin]))

      for (const item of inventory) {
        const skinId =
          input.gameType === 'csgo' ? item.csgo_skin_id : item.dota_skin_id
        const skin = skinById.get(skinId ?? 0)
        if (!skin) continue

        item.skin = skin as CsgoSkin
        if (input.gameType === 'csgo') {
          item.csgoSkin = skin as CsgoSkin
        } else {
          item.dotaSkin = skin as DotaSkin
        }
      }

      return {
        success: true,
        inventory,
        totalPrice: totalCents / 100,
        updatedBalance: user.balance,
      }
    })
  }

  private getSkinCounts(skinIds: number[]): Map<number, number> {
    const counts = new Map<number, number>()

    for (const skinId of skinIds) {
      if (!Number.isInteger(skinId) || skinId <= 0) {
        throw new BadRequestException('Skin IDs must be positive integers')
      }

      counts.set(skinId, (counts.get(skinId) ?? 0) + 1)
    }

    return counts
  }

  private findLockedSkins(
    manager: EntityManager,
    gameType: GameType,
    ids: number[],
  ): Promise<PurchasableSkin[]> {
    const repo =
      gameType === 'dota'
        ? manager.getRepository(DotaSkin)
        : manager.getRepository(CsgoSkin)

    return repo
      .createQueryBuilder('skin')
      .where('skin.id IN (:...ids)', { ids })
      .setLock('pessimistic_write')
      .getMany()
  }

  private assertSkinCanBePurchased(
    skin: PurchasableSkin,
    requestedCount: number,
  ): void {
    const priceCents = toCents(skin.market_price)

    if (skin.status !== SkinStatus.Available) {
      throw new BadRequestException('Skin is not available for purchase')
    }

    if (priceCents <= 0) {
      throw new BadRequestException('Skin price is not available')
    }

    if (!skin.image || !skin.name) {
      throw new BadRequestException('Skin is missing marketplace metadata')
    }

    if (getStockAmount(skin) < requestedCount) {
      throw new BadRequestException('Skin is out of stock')
    }
  }
}
