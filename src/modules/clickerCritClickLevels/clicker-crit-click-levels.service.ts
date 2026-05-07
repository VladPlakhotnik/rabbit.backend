import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ClickerCritClickLevel } from './entities/clicker_crit_click_level.entity'
import { CLICKER_CATALOG_CACHE_TTL_MS } from '../clickerUser/constants/clicker-catalog-cache.constants'

/**
 * Read-only catalog of crit-click tiers. See
 * ClickerAutoClickerLevelsService for the why-no-CRUD rationale.
 */
@Injectable()
export class ClickerCritClickLevelsService {
  private allCache: { expiresAt: number; value: ClickerCritClickLevel[] } | null = null

  constructor(
    @InjectRepository(ClickerCritClickLevel)
    private readonly repo: Repository<ClickerCritClickLevel>,
  ) {}

  async findAll(): Promise<ClickerCritClickLevel[]> {
    if (this.allCache && this.allCache.expiresAt > Date.now()) {
      return this.allCache.value
    }
    const value = await this.repo.find({ order: { level: 'ASC' } })
    this.allCache = {
      value,
      expiresAt: Date.now() + CLICKER_CATALOG_CACHE_TTL_MS,
    }
    return value
  }

  async findById(id: number): Promise<ClickerCritClickLevel> {
    const row = (await this.findAll()).find(level => level.id === id)
    if (!row) throw new NotFoundException('Crit-click level not found')
    return row
  }
}
