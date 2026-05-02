import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ClickerAutoClickerLevel } from './entities/clicker_auto_clicker_level.entity'

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
  constructor(
    @InjectRepository(ClickerAutoClickerLevel)
    private readonly repo: Repository<ClickerAutoClickerLevel>,
  ) {}

  findAll(): Promise<ClickerAutoClickerLevel[]> {
    return this.repo.find({ order: { level: 'ASC' } })
  }

  async findById(id: number): Promise<ClickerAutoClickerLevel> {
    const row = await this.repo.findOne({ where: { id } })
    if (!row) throw new NotFoundException('Auto-clicker level not found')
    return row
  }
}
