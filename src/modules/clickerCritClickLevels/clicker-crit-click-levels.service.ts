import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ClickerCritClickLevel } from './entities/clicker_crit_click_level.entity'

/**
 * Read-only catalog of crit-click tiers. See
 * ClickerAutoClickerLevelsService for the why-no-CRUD rationale.
 */
@Injectable()
export class ClickerCritClickLevelsService {
  constructor(
    @InjectRepository(ClickerCritClickLevel)
    private readonly repo: Repository<ClickerCritClickLevel>,
  ) {}

  findAll(): Promise<ClickerCritClickLevel[]> {
    return this.repo.find({ order: { level: 'ASC' } })
  }

  async findById(id: number): Promise<ClickerCritClickLevel> {
    const row = await this.repo.findOne({ where: { id } })
    if (!row) throw new NotFoundException('Crit-click level not found')
    return row
  }
}
