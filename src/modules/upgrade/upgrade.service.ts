import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, In } from 'typeorm'
import { User } from '../users/user.entity'
import { UserInventory } from '../userInventory/userInventory.entity'
import { UpgradeDto } from './dto/upgrade.dto'
import { UserHistoryService } from '../userHistory/userHistory.service'
import { CsgoSkin } from '../skins/csgo-skin.entity'

const MIN_UPGRADE_AMOUNT = 100
const MIN_SKINS_FOR_UPGRADE = 1
const MAX_SKINS_FOR_UPGRADE = 50

interface UpgradeResult {
  success: boolean
  message: string
  upgraded_skin?: {
    id: number
    name: string
    img_url: string
    rarity: string
    skin_price: number
  }
  used_skins?: {
    id: number
    name: string
    img_url: string
    rarity: string
    skin_price: number
  }[]
  target_skin?: {
    id: number
    name: string
    img_url: string
    rarity: string
    skin_price: number
  }
  chance: number
  new_balance?: number
  upgrade_cost?: number
  total_used_price?: number
}

@Injectable()
export class UpgradeService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(CsgoSkin)
    private readonly csgoSkinRepository: Repository<CsgoSkin>,
    @InjectRepository(UserInventory)
    private readonly userInventoryRepository: Repository<UserInventory>,
    private readonly userHistoryService: UserHistoryService,
  ) {}

  async performUpgrade(
    userId: number,
    upgradeDto: UpgradeDto,
  ): Promise<UpgradeResult> {
    return this.userRepository.manager.transaction(async manager => {
      const user = await manager.findOne(User, {
        where: { id: userId },
      })

      if (!user) {
        throw new NotFoundException('User not found')
      }

      let usedSkins: CsgoSkin[] = []
      let targetSkin: CsgoSkin
      let chance: number
      let totalUsedPrice = 0

      if (upgradeDto.use_balance) {
        const result = await this.processBalanceUpgrade(
          manager,
          user,
          upgradeDto,
        )
        targetSkin = result.targetSkin
        chance = result.chance
        totalUsedPrice = upgradeDto.upgrade_amount || 0
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

      const isSuccess = this.checkUpgradeSuccess(chance)
      const upgradedSkin = isSuccess
        ? await this.createUpgradedSkin(manager, userId, targetSkin)
        : null

      return this.buildUpgradeResult(
        isSuccess,
        upgradedSkin,
        usedSkins,
        targetSkin,
        chance,
        upgradeDto,
        user,
        totalUsedPrice,
      )
    })
  }

  private async processBalanceUpgrade(
    manager: any,
    user: User,
    upgradeDto: UpgradeDto,
  ): Promise<{ targetSkin: CsgoSkin; chance: number }> {
    if (!upgradeDto.upgrade_amount) {
      throw new BadRequestException(
        'upgrade_amount is required when using balance',
      )
    }

    if (
      !Number.isFinite(upgradeDto.upgrade_amount) ||
      upgradeDto.upgrade_amount <= 0
    ) {
      throw new BadRequestException('Upgrade amount must be a positive number')
    }

    if (user.balance < upgradeDto.upgrade_amount) {
      throw new BadRequestException('Insufficient balance for upgrade')
    }

    if (upgradeDto.upgrade_amount < MIN_UPGRADE_AMOUNT) {
      throw new BadRequestException(
        `Minimum upgrade amount is ${MIN_UPGRADE_AMOUNT}`,
      )
    }

    const targetSkin = await this.getRandomTargetSkin(manager)

    // Validate target skin has valid price
    if (!targetSkin.market_price || Number(targetSkin.market_price) <= 0) {
      throw new BadRequestException('Selected target skin has invalid price')
    }

    const chance = this.calculateChanceByPrice(
      upgradeDto.upgrade_amount,
      Number(targetSkin.market_price),
    )

    user.balance = Number(user.balance) - upgradeDto.upgrade_amount
    await manager.save(user)

    return { targetSkin, chance }
  }

  private async processInventoryUpgrade(
    manager: any,
    userId: number,
    upgradeDto: UpgradeDto,
  ): Promise<{
    usedSkins: CsgoSkin[]
    targetSkin: CsgoSkin
    chance: number
    totalUsedPrice: number
  }> {
    if (
      !upgradeDto.inventory_skin_ids ||
      upgradeDto.inventory_skin_ids.length === 0
    ) {
      throw new BadRequestException(
        'Inventory skin IDs are required when not using balance',
      )
    }

    if (!upgradeDto.target_skin_id) {
      throw new BadRequestException('Target skin ID is required')
    }

    // Validate array length
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

    // Check for duplicate IDs
    const uniqueIds = new Set(upgradeDto.inventory_skin_ids)
    if (uniqueIds.size !== upgradeDto.inventory_skin_ids.length) {
      throw new BadRequestException('Duplicate skin IDs are not allowed')
    }

    // Validate all IDs are positive numbers
    if (
      upgradeDto.inventory_skin_ids.some(id => !Number.isInteger(id) || id <= 0)
    ) {
      throw new BadRequestException('All skin IDs must be positive integers')
    }

    // Check if target skin ID is in the used skins array
    if (upgradeDto.inventory_skin_ids.includes(upgradeDto.target_skin_id)) {
      throw new BadRequestException(
        'Target skin cannot be used as upgrade material',
      )
    }

    const inventoryItems = await manager.find(UserInventory, {
      where: {
        id: In(upgradeDto.inventory_skin_ids),
        user: { id: userId },
        is_sold: false,
        is_withdrawn: false,
      },
      relations: ['skin'],
    })

    if (inventoryItems.length !== upgradeDto.inventory_skin_ids.length) {
      throw new NotFoundException(
        'Some skins not found in inventory or already used',
      )
    }

    const usedSkins: CsgoSkin[] = inventoryItems.map(
      (item: UserInventory) => item.skin,
    )

    // Check that all used skins are different (by skin_id, not just inventory_id)
    const uniqueSkinIds = new Set(usedSkins.map((skin: CsgoSkin) => skin.id))
    if (uniqueSkinIds.size !== usedSkins.length) {
      throw new BadRequestException(
        'Cannot use multiple instances of the same skin for upgrade',
      )
    }

    // Validate all skins have valid prices
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

    // Check if target skin has valid price
    if (!targetSkin.market_price || Number(targetSkin.market_price) <= 0) {
      throw new BadRequestException('Target skin has invalid price')
    }

    // Check if user already has target skin in inventory
    const existingTargetSkin = await manager.findOne(UserInventory, {
      where: {
        user: { id: userId },
        skin: { id: upgradeDto.target_skin_id },
        is_sold: false,
        is_withdrawn: false,
      },
    })

    if (existingTargetSkin) {
      throw new BadRequestException(
        'You already have this skin in your inventory',
      )
    }

    // Validate that target skin is more expensive than used skins
    // (optional check - can be removed if upgrade to cheaper skin is allowed)
    const targetPrice = Number(targetSkin.market_price)
    if (totalUsedPrice >= targetPrice) {
      // This is allowed, but we can add a warning or different logic
      // For now, we'll allow it as it increases chance
    }

    await manager.remove(UserInventory, inventoryItems)

    const chance = this.calculateChanceByPrice(totalUsedPrice, targetPrice)

    return { usedSkins, targetSkin, chance, totalUsedPrice }
  }

  private async getRandomTargetSkin(manager: any): Promise<CsgoSkin> {
    const count = await manager.count(CsgoSkin)
    if (count === 0) {
      throw new NotFoundException('No skins available in market')
    }

    const randomIndex = Math.floor(Math.random() * count)
    const skins = await manager.find(CsgoSkin, {
      take: 1,
      skip: randomIndex,
    })

    if (skins.length === 0) {
      throw new NotFoundException('Failed to get random skin')
    }

    return skins[0]
  }

  private checkUpgradeSuccess(chance: number): boolean {
    return Math.random() * 100 < chance
  }

  private async createUpgradedSkin(
    manager: any,
    userId: number,
    targetSkin: CsgoSkin,
  ): Promise<CsgoSkin> {
    const newInventoryItem = manager.create(UserInventory, {
      user: { id: userId },
      skin: targetSkin,
      obtained_at: new Date(),
      is_sold: false,
      is_withdrawn: false,
    })

    await manager.save(newInventoryItem)
    return targetSkin
  }

  private buildUpgradeResult(
    isSuccess: boolean,
    upgradedSkin: CsgoSkin | null,
    usedSkins: CsgoSkin[],
    targetSkin: CsgoSkin,
    chance: number,
    upgradeDto: UpgradeDto,
    user: User,
    totalUsedPrice: number,
  ): UpgradeResult {
    return {
      success: isSuccess,
      message: isSuccess
        ? 'Upgrade successful! You got the target skin!'
        : 'Upgrade failed. Better luck next time!',
      upgraded_skin: upgradedSkin
        ? this.mapSkinToResult(upgradedSkin)
        : undefined,
      used_skins:
        usedSkins.length > 0 ? usedSkins.map(this.mapSkinToResult) : undefined,
      target_skin: this.mapSkinToResult(targetSkin),
      chance,
      new_balance: upgradeDto.use_balance ? Number(user.balance) : undefined,
      upgrade_cost: upgradeDto.use_balance
        ? upgradeDto.upgrade_amount
        : undefined,
      total_used_price:
        !upgradeDto.use_balance && totalUsedPrice > 0
          ? totalUsedPrice
          : undefined,
    }
  }

  private mapSkinToResult(skin: CsgoSkin): {
    id: number
    name: string
    img_url: string
    rarity: string
    skin_price: number
  } {
    return {
      id: skin.id,
      name: skin.market_hash_name,
      img_url: skin.image,
      rarity: skin.quality,
      skin_price: Number(skin.market_price),
    }
  }

  private calculateChanceByPrice(
    usedPrice: number,
    targetPrice: number,
  ): number {
    // Шанс зависит от соотношения цены используемого ресурса к целевому скину
    // Используется плавная формула для более точного расчета
    // Минимальный шанс: 5%, Максимальный шанс: 90%

    if (targetPrice <= 0) {
      throw new BadRequestException('Target price must be greater than zero')
    }

    if (usedPrice <= 0) {
      throw new BadRequestException('Used price must be greater than zero')
    }

    const priceRatio = usedPrice / targetPrice

    // Минимальный и максимальный шанс
    const MIN_CHANCE = 5
    const MAX_CHANCE = 90

    // Если цена используемого ресурса больше или равна целевой - максимальный шанс
    if (priceRatio >= 1.0) {
      return MAX_CHANCE
    }

    // Используем степенную функцию для более плавного перехода
    // Формула: chance = MIN + (MAX - MIN) * (ratio^1.5)
    // Степень 1.5 делает кривую более реалистичной (нелинейный рост)
    const normalizedRatio = Math.pow(priceRatio, 1.5)
    const chance = MIN_CHANCE + (MAX_CHANCE - MIN_CHANCE) * normalizedRatio

    // Округляем до 2 знаков после запятой для точности
    return Math.round(chance * 100) / 100
  }
}
