import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { User } from './users.entity'

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  // Метод для получения всех пользователей
  findAll() {
    return this.userRepository.find()
  }

  async findById(id: number): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id },
    })
  }

  async findBySteamId(steamid: string): Promise<User | null> {
    const user = await this.userRepository.findOne({
      where: { steamid: steamid.toString() },
    })
    return user
  }

  // Метод для создания нового пользователя
  async create(userData: Partial<User>): Promise<User> {
    const newUser = this.userRepository.create(userData)
    return this.userRepository.save(newUser)
  }
}
