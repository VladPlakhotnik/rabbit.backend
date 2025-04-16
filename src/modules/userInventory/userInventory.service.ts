import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { UserInventory } from './userInventory.entity'
import { User } from '../users/user.entity'
import { Skin } from '../skins/skin.entity'
import { Case } from '../cases/case.entity'

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

  async getUserInventory(userId: number): Promise<UserInventory[]> {
    try {
      if (!userId) {
        throw new BadRequestException('User ID is required')
      }
      const inventories = await this.userInventoryRepository.find({
        where: { user: { id: userId } },
        relations: ['skin'],
        order: { obtained_at: 'DESC' },
      })
      return inventories
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
    try {
      if (!inventoryId || !userId) {
        throw new BadRequestException('Inventory ID and User ID are required')
      }

      const inventoryItem = await this.userInventoryRepository.findOne({
        where: { id: inventoryId },
        relations: ['user', 'skin'],
      })

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

      const user = inventoryItem.user
      const skinPrice = inventoryItem.skin.skin_price
      user.balance = Number(user.balance) + skinPrice
      await this.userRepository.save(user)

      inventoryItem.is_sold = true
      await this.userInventoryRepository.save(inventoryItem)

      return inventoryItem
    } catch (error: unknown) {
      this.logger.error(
        `Error selling skin ${inventoryId} for user ${userId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
      throw error
    }
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
        relations: ['skin'],
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
              name: item.skin.name,
              img_url: item.skin.img_url,
              rarity: item.skin.rarity,
              skin_price: item.skin.skin_price,
            },
            obtained_at: item.obtained_at,
            is_sold: item.is_sold,
          }
        }),
      )

      const totalSellPrice = unsoldSkins.reduce(
        (sum, item) => sum + Number(item.skin.skin_price),
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

  async createInventory(
    userId: number,
    skin: Skin,
    caseEntity: Case,
  ): Promise<UserInventory> {
    return this.userInventoryRepository.manager.transaction(async manager => {
      const inventory = manager.create(UserInventory, {
        user: { id: userId },
        skin,
        case: caseEntity,
        obtained_at: new Date(),
        is_sold: false,
        is_withdrawn: false,
        withdrawn_at: null,
      })
      return manager.save(inventory)
    })
  }
}
