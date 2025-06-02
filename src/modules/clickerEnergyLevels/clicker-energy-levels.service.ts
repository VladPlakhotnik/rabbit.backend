import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ClickerEnergyLevel } from './entities/clicker_energy_level.entity'

@Injectable()
export class ClickerEnergyLevelsService {
  constructor(
    @InjectRepository(ClickerEnergyLevel)
    private readonly levelRepository: Repository<ClickerEnergyLevel>,
  ) {}

  findAll() {
    return this.levelRepository.find()
  }

  findById(id: number) {
    return this.levelRepository.findOne({ where: { id } })
  }

  create(data: Partial<ClickerEnergyLevel>) {
    const level = this.levelRepository.create(data)
    return this.levelRepository.save(level)
  }

  update(id: number, data: Partial<ClickerEnergyLevel>) {
    return this.levelRepository.update(id, data)
  }

  remove(id: number) {
    return this.levelRepository.delete(id)
  }
}
