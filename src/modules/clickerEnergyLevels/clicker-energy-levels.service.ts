import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ClickerEnergyLevel } from './entities/clicker_energy_level.entity'
import { CLICKER_CATALOG_CACHE_TTL_MS } from '../clickerUser/constants/clicker-catalog-cache.constants'

@Injectable()
export class ClickerEnergyLevelsService {
  private allCache: { expiresAt: number; value: ClickerEnergyLevel[] } | null = null

  constructor(
    @InjectRepository(ClickerEnergyLevel)
    private readonly levelRepository: Repository<ClickerEnergyLevel>,
  ) {}

  async findAll() {
    if (this.allCache && this.allCache.expiresAt > Date.now()) {
      return this.allCache.value
    }
    const value = await this.levelRepository.find()
    this.allCache = {
      value,
      expiresAt: Date.now() + CLICKER_CATALOG_CACHE_TTL_MS,
    }
    return value
  }

  async findById(id: number) {
    const cached = (await this.findAll()).find(level => level.id === id)
    return cached ?? this.levelRepository.findOne({ where: { id } })
  }

  async create(data: Partial<ClickerEnergyLevel>) {
    const level = this.levelRepository.create(data)
    const result = await this.levelRepository.save(level)
    this.invalidateCache()
    return result
  }

  async update(id: number, data: Partial<ClickerEnergyLevel>) {
    const result = await this.levelRepository.update(id, data)
    this.invalidateCache()
    return result
  }

  async remove(id: number) {
    const result = await this.levelRepository.delete(id)
    this.invalidateCache()
    return result
  }

  private invalidateCache(): void {
    this.allCache = null
  }
}
