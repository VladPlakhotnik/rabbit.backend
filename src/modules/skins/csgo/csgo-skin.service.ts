import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, In } from 'typeorm'
import { CsgoSkin } from '../csgo-skin.entity'
import { SkinStatus } from '../shared/skin-status.enum'

// CRUD + status transitions for csgo_skins. Deliberately thin — the
// heavy lifting (talking to marketplaces, parsing, computing markups)
// lives in csgo-sync.service.ts. This module is what consumers
// (controller, case service, withdraw service) call; the sync service
// is its only privileged caller for status mutations.

export interface SkinFilters {
  inStock?: boolean
  category?: string
  itemType?: string
  search?: string
  minPrice?: number
  maxPrice?: number
  quality?: string
  exterior?: string
  collection?: string
  sortDir?: 'asc' | 'desc'
  // Whether to include rows that aren't currently buyable on the market
  // (`unavailable_on_market`). Default false — most callers (case page,
  // market UI) only want available stock; the case-open / inventory
  // flow asks for `true` so users can still see what they own.
  includeUnavailable?: boolean
}

export interface PaginatedSkins {
  skins: CsgoSkin[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}

@Injectable()
export class CsgoSkinService {
  private readonly logger = new Logger(CsgoSkinService.name)

  constructor(
    @InjectRepository(CsgoSkin)
    private readonly repo: Repository<CsgoSkin>,
  ) {}

  // ---- Read paths ----------------------------------------------------

  async findByHashName(hashName: string): Promise<CsgoSkin | null> {
    return this.repo.findOne({ where: { market_hash_name: hashName } })
  }

  async findByIds(ids: number[]): Promise<CsgoSkin[]> {
    if (ids.length === 0) return []
    return this.repo.find({ where: { id: In(ids) } })
  }

  // Substring search over hash_name. Used by the upgrade page market
  // search and (eventually) admin tooling. Always returns the raw
  // matched rows — pagination / filtering is the caller's job.
  async searchSimilar(searchTerm: string, limit = 20): Promise<CsgoSkin[]> {
    if (!searchTerm.trim()) return []

    return this.repo
      .createQueryBuilder('skin')
      .where('skin.market_hash_name ILIKE :term', { term: `%${searchTerm}%` })
      .andWhere('skin.status != :disabled', { disabled: SkinStatus.Disabled })
      .orderBy('skin.market_price', 'DESC')
      .limit(limit)
      .getMany()
  }

  // Big query builder for the market / upgrade pages. Mirrors what the
  // old `SkinService.getAllSkinsFromDatabase` did, with three deltas:
  //   1. Status filter — exclude `disabled` always; exclude
  //      `unavailable_on_market` unless caller opts in.
  //   2. Removed the duplicated NOT-NULL guards on every filter — they
  //      collapse into a single `status` predicate now.
  //   3. Game filter dropped — we have separate csgo / dota services
  //      now, no need for a "this is CS2" branch inside the SQL.
  async findAllPaginated(
    page = 1,
    limit = 100,
    filters: SkinFilters = {},
  ): Promise<PaginatedSkins> {
    const qb = this.repo.createQueryBuilder('skin')

    // Status: hide disabled always; hide unavailable unless explicitly
    // included.
    qb.where('skin.status != :disabled', { disabled: SkinStatus.Disabled })

    if (!filters.includeUnavailable) {
      qb.andWhere('skin.status = :available', { available: SkinStatus.Available })
    }

    // Image / price / name sanity — same predicates as the old
    // service, kept because rows mid-migration may have nulls.
    qb.andWhere("skin.image IS NOT NULL AND skin.image != ''")
    qb.andWhere('skin.market_price IS NOT NULL AND skin.market_price > 0')
    qb.andWhere("skin.name IS NOT NULL AND skin.name != ''")

    if (filters.inStock === true) {
      qb.andWhere("skin.amount_in_market != '' AND skin.amount_in_market != '0'")
    }
    if (filters.category) {
      qb.andWhere('skin.category = :category', { category: filters.category })
    }
    if (filters.itemType) {
      qb.andWhere('skin.item_type = :itemType', { itemType: filters.itemType })
    }
    if (filters.search) {
      qb.andWhere(
        '(skin.name ILIKE :search OR skin.market_hash_name ILIKE :search)',
        { search: `%${filters.search}%` },
      )
    }
    if (filters.minPrice !== undefined) {
      qb.andWhere('skin.market_price >= :minPrice', { minPrice: filters.minPrice })
    }
    if (filters.maxPrice !== undefined) {
      qb.andWhere('skin.market_price <= :maxPrice', { maxPrice: filters.maxPrice })
    }
    if (filters.quality) {
      qb.andWhere('skin.quality = :quality', { quality: filters.quality })
    }
    if (filters.exterior) {
      qb.andWhere('skin.exterior = :exterior', { exterior: filters.exterior })
    }
    if (filters.collection) {
      qb.andWhere('skin.collection ILIKE :col', { col: `%${filters.collection}%` })
    }

    qb.orderBy('skin.market_price', filters.sortDir === 'asc' ? 'ASC' : 'DESC')
    qb.skip((page - 1) * limit).take(limit)

    const [skins, total] = await qb.getManyAndCount()
    return { skins, total, page, limit, hasMore: page * limit < total }
  }

  async getTotalSkinsCount(): Promise<{ count: number }> {
    const count = await this.repo
      .createQueryBuilder('skin')
      .where('skin.status = :available', { available: SkinStatus.Available })
      .andWhere("skin.image IS NOT NULL AND skin.image != ''")
      .andWhere('skin.market_price IS NOT NULL AND skin.market_price > 0')
      .getCount()

    return { count }
  }

  // ---- Status mutations (sync-service only) -------------------------

  // Flip rows that haven't been seen in the latest feed to
  // `unavailable_on_market`. `disabled` rows are never touched — admin
  // intent wins over sync.
  async markStaleAsUnavailable(seenHashNames: string[]): Promise<number> {
    if (seenHashNames.length === 0) {
      this.logger.warn(
        'markStaleAsUnavailable called with empty list — refusing to mark all skins unavailable',
      )
      return 0
    }

    const result = await this.repo
      .createQueryBuilder()
      .update(CsgoSkin)
      .set({ status: SkinStatus.UnavailableOnMarket })
      .where('status = :available', { available: SkinStatus.Available })
      .andWhere('market_hash_name NOT IN (:...names)', { names: seenHashNames })
      .execute()

    return result.affected ?? 0
  }

  // Bring previously-unavailable rows back to `available` if they
  // showed up in the feed again. Returns count of rows reactivated.
  async markReturnedAsAvailable(seenHashNames: string[]): Promise<number> {
    if (seenHashNames.length === 0) return 0

    const result = await this.repo
      .createQueryBuilder()
      .update(CsgoSkin)
      .set({ status: SkinStatus.Available })
      .where('status = :unavailable', { unavailable: SkinStatus.UnavailableOnMarket })
      .andWhere('market_hash_name IN (:...names)', { names: seenHashNames })
      .execute()

    return result.affected ?? 0
  }

  // Repository accessor for the sync service to do bulk upserts —
  // the upsert helper itself lives there because it's tied to the
  // MarketTm response shape, not generic CRUD.
  getRepo(): Repository<CsgoSkin> {
    return this.repo
  }
}
