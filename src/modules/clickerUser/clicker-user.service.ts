import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ClickerUser } from './entities/clicker_user.entity'

@Injectable()
export class ClickerUserService {
  constructor(
    @InjectRepository(ClickerUser)
    private readonly userRepository: Repository<ClickerUser>,
  ) {}

  findAll() {
    return this.userRepository.find()
  }

  findById(id: number) {
    return this.userRepository.findOne({ where: { id } })
  }

  create(data: Partial<ClickerUser>) {
    const user = this.userRepository.create(data)
    return this.userRepository.save(user)
  }

  update(id: number, data: Partial<ClickerUser>) {
    return this.userRepository.update(id, data)
  }

  remove(id: number) {
    return this.userRepository.delete(id)
  }
}
