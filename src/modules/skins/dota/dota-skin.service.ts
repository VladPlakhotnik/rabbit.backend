import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { DotaSkin } from '../dota-skin.entity'
import { SkinStatus } from '../shared/skin-status.enum'

// Mirror of CsgoSkinService for Dota 2. Same shape — same status
// transitions, same paginated list, same search. The two services
// are deliberately kept as siblings rather than a generic base class:
// the entity-specific filter columns differ enough (hero/rarity/slot
// for Dota vs exterior/StatTrak/Souvenir for CS) that a base class
// would either be too narrow to be useful or overgrown with optional
// hooks.

export interface DotaSkinFilters {
  inStock?: boolean
  category?: string
  itemType?: string
  search?: string
  minPrice?: number
  maxPrice?: number
  // Dota-specific filters.
  hero?: string
  rarity?: string
  slot?: string
  quality?: string
  collection?: string
  sortDir?: 'asc' | 'desc'
  includeUnavailable?: boolean
}

export interface PaginatedDotaSkins {
  skins: DotaSkin[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}

@Injectable()
export class DotaSkinService {
  private readonly logger = new Logger(DotaSkinService.name)

  constructor(
    @InjectRepository(DotaSkin)
    private readonly repo: Repository<DotaSkin>,
  ) {}

  // ---- Read ---------------------------------------------------------

  async findByHashName(hashName: string): Promise<DotaSkin | null> {
    return this.repo.findOne({ where: { market_hash_name: hashName } })
  }

  async findByIds(ids: number[]): Promise<DotaSkin[]> {
    if (ids.length === 0) return []
    return this.repo.find({ where: { id: In(ids) } })
  }

  async searchSimilar(searchTerm: string, limit = 20): Promise<DotaSkin[]> {
    if (!searchTerm.trim()) return []

    return this.repo
      .createQueryBuilder('skin')
      .where('skin.market_hash_name ILIKE :term', { term: `%${searchTerm}%` })
      .andWhere('skin.status != :disabled', { disabled: SkinStatus.Disabled })
      .orderBy('skin.market_price', 'DESC')
      .limit(limit)
      .getMany()
  }

  async findAllPaginated(
    page = 1,
    limit = 100,
    filters: DotaSkinFilters = {},
  ): Promise<PaginatedDotaSkins> {
    const qb = this.repo.createQueryBuilder('skin')

    qb.where('skin.status != :disabled', { disabled: SkinStatus.Disabled })

    if (!filters.includeUnavailable) {
      qb.andWhere('skin.status = :available', { available: SkinStatus.Available })
    }

    qb.andWhere("skin.image IS NOT NULL AND skin.image != ''")
    qb.andWhere('skin.market_price IS NOT NULL AND skin.market_price > 0')
    qb.andWhere("skin.name IS NOT NULL AND skin.name != ''")

    if (filters.inStock === true) {
      qb.andWhere("skin.amount_in_market != '' AND skin.amount_in_market != '0'")
    }
    if (filters.category) qb.andWhere('skin.category = :c', { c: filters.category })
    if (filters.itemType) qb.andWhere('skin.item_type = :it', { it: filters.itemType })
    if (filters.hero) qb.andWhere('skin.hero = :hero', { hero: filters.hero })
    if (filters.rarity) qb.andWhere('skin.rarity = :rarity', { rarity: filters.rarity })
    if (filters.slot) qb.andWhere('skin.slot = :slot', { slot: filters.slot })
    if (filters.quality) qb.andWhere('skin.quality = :q', { q: filters.quality })
    if (filters.search) {
      qb.andWhere(
        '(skin.name ILIKE :s OR skin.market_hash_name ILIKE :s)',
        { s: `%${filters.search}%` },
      )
    }
    if (filters.minPrice !== undefined) {
      qb.andWhere('skin.market_price >= :min', { min: filters.minPrice })
    }
    if (filters.maxPrice !== undefined) {
      qb.andWhere('skin.market_price <= :max', { max: filters.maxPrice })
    }
    if (filters.collection) {
      // collection is a text[] — use ANY/= for membership check.
      qb.andWhere(':col = ANY(skin.collection)', { col: filters.collection })
    }

    qb.orderBy('skin.market_price', filters.sortDir === 'asc' ? 'ASC' : 'DESC')
    qb.skip((page - 1) * limit).take(limit)

    const [skins, total] = await qb.getManyAndCount()
    return { skins, total, page, limit, hasMore: page * limit < total }
  }

  async getTotalSkinsCount(): Promise<{ count: number }> {
    const count = await this.repo
      .createQueryBuilder('skin')
      .where('skin.status = :av', { av: SkinStatus.Available })
      .andWhere("skin.image IS NOT NULL AND skin.image != ''")
      .andWhere('skin.market_price IS NOT NULL AND skin.market_price > 0')
      .getCount()

    return { count }
  }

  // ---- Status mutations (sync-service only) -------------------------

  async markStaleAsUnavailable(seenHashNames: string[]): Promise<number> {
    if (seenHashNames.length === 0) {
      this.logger.warn(
        'markStaleAsUnavailable called with empty list — refusing to mark all skins unavailable',
      )
      return 0
    }

    const result = await this.repo
      .createQueryBuilder()
      .update(DotaSkin)
      .set({ status: SkinStatus.UnavailableOnMarket })
      .where('status = :av', { av: SkinStatus.Available })
      .andWhere('market_hash_name NOT IN (:...names)', { names: seenHashNames })
      .execute()

    return result.affected ?? 0
  }

  async markReturnedAsAvailable(seenHashNames: string[]): Promise<number> {
    if (seenHashNames.length === 0) return 0

    const result = await this.repo
      .createQueryBuilder()
      .update(DotaSkin)
      .set({ status: SkinStatus.Available })
      .where('status = :unav', { unav: SkinStatus.UnavailableOnMarket })
      .andWhere('market_hash_name IN (:...names)', { names: seenHashNames })
      .execute()

    return result.affected ?? 0
  }

  getRepo(): Repository<DotaSkin> {
    return this.repo
  }
}
