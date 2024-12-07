import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { User } from './user.entity'

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
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

  async updateTradeLink(userId: number, tradeLink: string): Promise<void> {
    await this.userRepository.update(userId, { trade_link: tradeLink })
  }
}
