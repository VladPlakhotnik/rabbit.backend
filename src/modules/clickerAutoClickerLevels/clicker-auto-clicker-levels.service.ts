import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ClickerAutoClickerLevel } from './entities/clicker_auto_clicker_level.entity'
import { CLICKER_CATALOG_CACHE_TTL_MS } from '../clickerUser/constants/clicker-catalog-cache.constants'

/**
 * Read-only catalog of auto-clicker tiers.
 *
 * No write methods on purpose — admin tools that need to add / edit
 * tiers should run a SQL migration. Exposing CRUD here would mean
 * every endpoint needs role-guard wiring; keeping the surface read-only
 * makes it impossible to accidentally ship a public mutation.
 */
@Injectable()
export class ClickerAutoClickerLevelsService {
  private allCache: { expiresAt: number; value: ClickerAutoClickerLevel[] } | null = null

  constructor(
    @InjectRepository(ClickerAutoClickerLevel)
    private readonly repo: Repository<ClickerAutoClickerLevel>,
  ) {}

  async findAll(): Promise<ClickerAutoClickerLevel[]> {
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

  async findById(id: number): Promise<ClickerAutoClickerLevel> {
    const row = (await this.findAll()).find(level => level.id === id)
    if (!row) throw new NotFoundException('Auto-clicker level not found')
    return row
  }
}
