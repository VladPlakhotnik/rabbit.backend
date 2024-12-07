import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { UserInventory } from './userInventory.entity'
import { User } from '../users/user.entity'

@Injectable()
export class UserInventoryService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserInventory)
    private readonly userInventoryRepository: Repository<UserInventory>,
  ) {}

  // Method to get the inventory for a user
  async getUserInventory(userId: number): Promise<UserInventory[]> {
    const inventories = await this.userInventoryRepository.find({
      where: { user: { id: userId } },
      relations: ['skin'],
      order: { obtained_at: 'DESC' },
    })

    return inventories
  }

  async sellSkin(inventoryId: number, userId: number): Promise<UserInventory> {
    // Найти запись в инвентаре
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

    // // Логика продажи: например, возвращение части стоимости скина
    // // Предположим, что пользователь получает 50% от стоимости скина
    // const sellPrice = Number(inventoryItem.skin.skin_price) * 0.5

    // Обновить баланс пользователя
    const user = inventoryItem.user
    const skinPrice = inventoryItem.skin.skin_price
    user.balance = Number(user.balance) + skinPrice
    await this.userRepository.save(user)

    // Обновить запись инвентаря
    inventoryItem.is_sold = true
    // Можно добавить поле для цены продажи, если нужно
    // inventoryItem.sold_price = sellPrice;
    await this.userInventoryRepository.save(inventoryItem)

    return inventoryItem
  }

  async sellAllSkins(
    userId: number,
  ): Promise<{ soldItems: any[]; updatedBalance: number }> {
    // Находим пользователя
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['inventories'],
    })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    // Находим все не проданные и не выведенные скины пользователя
    const unsoldSkins = await this.userInventoryRepository.find({
      where: { user: { id: userId }, is_sold: false, is_withdrawn: false },
      relations: ['skin'],
    })

    if (unsoldSkins.length === 0) {
      throw new BadRequestException('You dont have skins for sell')
    }

    // Инициализируем общую сумму продажи
    let totalSellPrice = 0
    const soldItems = []

    // Обход всех не проданных скинов
    for (const item of unsoldSkins) {
      const sellPrice = Number(item.skin.skin_price) // Предположим, что пользователь получает 50% от цены скина
      totalSellPrice += sellPrice

      // Обновляем запись инвентаря
      item.is_sold = true
      await this.userInventoryRepository.save(item)

      // Добавляем информацию о проданном скине
      soldItems.push({
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
      })
    }

    // Обновляем баланс пользователя
    user.balance = user.balance + totalSellPrice
    await this.userRepository.save(user)

    return {
      soldItems,
      updatedBalance: user.balance,
    }
  }
}
