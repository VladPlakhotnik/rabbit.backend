import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { User } from '../users/user.entity'
import { UserInventory } from '../userInventory/userInventory.entity'
import { UpgradeDto } from './dto/upgrade.dto'
import { UserHistoryService } from '../userHistory/userHistory.service'
import { CsgoSkin } from '../skins/csgo-skin.entity'

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
  used_skin?: {
    id: number
    name: string
    img_url: string
    rarity: string
    skin_price: number
  }
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
    const user = await this.userRepository.findOne({
      where: { id: userId },
    })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    let usedSkin: CsgoSkin | null = null
    let targetSkin: CsgoSkin | null = null
    let chance = 0

    if (upgradeDto.use_balance) {
      // Используем деньги с баланса
      if (!upgradeDto.upgrade_amount) {
        throw new BadRequestException(
          'upgrade_amount is required when using balance',
        )
      }

      if (user.balance < upgradeDto.upgrade_amount) {
        throw new BadRequestException('Insufficient balance for upgrade')
      }

      if (upgradeDto.upgrade_amount < 100) {
        throw new BadRequestException('Minimum upgrade amount is 100')
      }

      // Генерируем случайный скин из маркета как цель
      const allSkins = await this.csgoSkinRepository.find()
      targetSkin = allSkins[Math.floor(Math.random() * allSkins.length)]

      // Шанс зависит от соотношения потраченных денег к цене целевого скина
      chance = this.calculateChanceByPrice(
        upgradeDto.upgrade_amount,
        Number(targetSkin.market_price),
      )

      // Списываем деньги с баланса
      user.balance = Number(user.balance) - upgradeDto.upgrade_amount
      await this.userRepository.save(user)
    } else {
      // Используем скин из инвентаря
      if (!upgradeDto.inventory_skin_id) {
        throw new BadRequestException(
          'Inventory skin ID is required when not using balance',
        )
      }

      const inventoryItem = await this.userInventoryRepository.findOne({
        where: {
          id: upgradeDto.inventory_skin_id,
          user: { id: userId },
          is_sold: false,
          is_withdrawn: false,
        },
        relations: ['skin'],
      })

      if (!inventoryItem) {
        throw new NotFoundException('Skin not found in inventory')
      }

      usedSkin = inventoryItem.skin

      if (upgradeDto.target_skin_id) {
        targetSkin = await this.csgoSkinRepository.findOne({
          where: { id: upgradeDto.target_skin_id },
        })

        if (!targetSkin) {
          throw new NotFoundException('Target skin not found')
        }
      } else {
        throw new NotFoundException('Target skin is required')
      }

      // Удаляем скин из инвентаря
      await this.userInventoryRepository.remove(inventoryItem)

      // Шанс зависит от соотношения цены используемого скина к целевому скину
      chance = this.calculateChanceByPrice(
        Number(usedSkin.market_price),
        Number(targetSkin.market_price),
      )
    }

    // Проверяем успешность апгрейда
    const isSuccess = Math.random() * 100 < chance

    let upgradedSkin: CsgoSkin | null = null
    let message = ''

    if (isSuccess) {
      // Создаем новый скин в инвентаре пользователя
      const newInventoryItem = this.userInventoryRepository.create({
        user: { id: userId },
        skin: targetSkin,
        obtained_at: new Date(),
        is_sold: false,
        is_withdrawn: false,
      })

      await this.userInventoryRepository.save(newInventoryItem)
      upgradedSkin = targetSkin
      message = 'Upgrade successful! You got the target skin!'
    } else {
      message = 'Upgrade failed. Better luck next time!'
    }

    // await this.userHistoryService.upgradeSkin(
    //   userId,
    //   targetSkin.id,
    //   targetSkin.market_hash_name,
    //   usedSkin?.quality || '',
    //   targetSkin.quality,
    //   upgradeDto.upgrade_amount || 0,
    // )

    return {
      success: isSuccess,
      message,
      upgraded_skin: upgradedSkin
        ? {
            id: upgradedSkin.id,
            name: upgradedSkin.market_hash_name,
            img_url: upgradedSkin.image,
            rarity: upgradedSkin.quality,
            skin_price: Number(upgradedSkin.market_price),
          }
        : undefined,
      used_skin: usedSkin
        ? {
            id: usedSkin.id,
            name: usedSkin.market_hash_name,
            img_url: usedSkin.image,
            rarity: usedSkin.quality,
            skin_price: Number(usedSkin.market_price),
          }
        : undefined,
      target_skin: targetSkin
        ? {
            id: targetSkin.id,
            name: targetSkin.market_hash_name,
            img_url: targetSkin.image,
            rarity: targetSkin.quality,
            skin_price: Number(targetSkin.market_price),
          }
        : undefined,
      chance,
      new_balance: upgradeDto.use_balance ? Number(user.balance) : undefined,
      upgrade_cost: upgradeDto.use_balance
        ? upgradeDto.upgrade_amount
        : undefined,
    }
  }

  private calculateChanceByPrice(
    usedPrice: number,
    targetPrice: number,
  ): number {
    // Шанс зависит от соотношения цены используемого ресурса к целевому скину
    // Если цена используемого ресурса больше или равна целевому скину - высокий шанс
    // Если цена используемого ресурса меньше целевого скина - шанс пропорционально уменьшается

    const priceRatio = usedPrice / targetPrice

    if (priceRatio >= 1.0) {
      // Если тратим больше или равно цене целевого скина - 85% шанс
      return 85
    } else if (priceRatio >= 0.8) {
      // 80-100% от цены целевого скина - 70% шанс
      return 70
    } else if (priceRatio >= 0.6) {
      // 60-80% от цены целевого скина - 55% шанс
      return 55
    } else if (priceRatio >= 0.4) {
      // 40-60% от цены целевого скина - 40% шанс
      return 40
    } else if (priceRatio >= 0.2) {
      // 20-40% от цены целевого скина - 25% шанс
      return 25
    } else {
      // Меньше 20% от цены целевого скина - 10% шанс
      return 10
    }
  }
}
