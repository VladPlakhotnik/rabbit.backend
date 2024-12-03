import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { User } from './user.entity'
import { UserInventory } from '../userInventory/userInventory.entity'

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserInventory)
    private readonly userInventoryRepository: Repository<UserInventory>,
  ) {}

  findAll() {
    return this.userRepository.find()
  }

  async findById(id: number): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id },
    })
  }

  async findBySteamId(steam_id: number): Promise<User | null> {
    const user = await this.userRepository.findOne({
      where: { steam_id },
    })
    return user || null
  }

  async create(userData: Partial<User>): Promise<User> {
    const newUser = this.userRepository.create(userData)
    return this.userRepository.save(newUser)
  }

  // Method to get the inventory for a user
  async getUserInventory(userId: number): Promise<UserInventory[]> {
    const inventories = await this.userInventoryRepository.find({
      where: { user: { id: userId } },
      relations: ['skin'],
    })

    return inventories
  }

  async updateTradeLink(userId: number, tradeLink: string): Promise<void> {
    await this.userRepository.update(userId, { trade_link: tradeLink })
  }
}
