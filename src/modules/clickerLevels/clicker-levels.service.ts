import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ClickerLevel } from './entities/clicker_level.entity'

@Injectable()
export class ClickerLevelsService {
  constructor(
    @InjectRepository(ClickerLevel)
    private readonly levelRepository: Repository<ClickerLevel>,
  ) {}

  findAll() {
    return this.levelRepository.find()
  }

  findById(id: number) {
    return this.levelRepository.findOne({ where: { id } })
  }

  create(data: Partial<ClickerLevel>) {
    const level = this.levelRepository.create(data)
    return this.levelRepository.save(level)
  }

  update(id: number, data: Partial<ClickerLevel>) {
    return this.levelRepository.update(id, data)
  }

  remove(id: number) {
    return this.levelRepository.delete(id)
  }
}
