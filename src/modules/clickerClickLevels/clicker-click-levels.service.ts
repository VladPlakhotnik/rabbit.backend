import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ClickerClickLevel } from './entities/clicker_click_level.entity'

@Injectable()
export class ClickerClickLevelsService {
  constructor(
    @InjectRepository(ClickerClickLevel)
    private readonly levelRepository: Repository<ClickerClickLevel>,
  ) {}

  findAll() {
    return this.levelRepository.find()
  }

  findById(id: number) {
    return this.levelRepository.findOne({ where: { id } })
  }

  create(data: Partial<ClickerClickLevel>) {
    const level = this.levelRepository.create(data)
    return this.levelRepository.save(level)
  }

  update(id: number, data: Partial<ClickerClickLevel>) {
    return this.levelRepository.update(id, data)
  }

  remove(id: number) {
    return this.levelRepository.delete(id)
  }
}
