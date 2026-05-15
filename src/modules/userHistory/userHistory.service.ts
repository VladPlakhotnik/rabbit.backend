import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { UserHistory } from './userHistory.entity'
import { CaseHistory, CaseHistoryDrop } from './entities/case-history.entity'
import {
  UpgradeHistory,
  UpgradeHistoryMaterial,
} from './entities/upgrade-history.entity'
import { UpgradeHistoryItemDto } from './dto/upgrade-history-item.dto'
import {
  UpgradeHistoryDetailDto,
  UpgradeMaterialDetailDto,
} from './dto/upgrade-history-detail.dto'
import { CsgoSkin } from '../skins/csgo-skin.entity'
import { DotaSkin } from '../skins/dota-skin.entity'
import {
  buildPaginatedResponse,
  normalizePagination,
  type NormalizedPagination,
  type PaginatedResponse,
} from '../../common/pagination'
import {
  CrashSession,
  type CrashSessionStatus,
  type CrashStakeMode,
} from '../crash/entities/crash-session.entity'

type HistoryGameType = 'csgo' | 'dota'

export interface CrashHistoryItemDto {
  cashout_multiplier: number | null
  created_at: Date
  id: number
  mfr_seed_hash: string
  slot: number
  stake_amount: number
  stake_mode: CrashStakeMode
  status: CrashSessionStatus
  updated_at: Date
  win_amount: number | null
}

@Injectable()
export class UserHistoryService {
  constructor(
    @InjectRepository(UserHistory)
    private readonly userHistoryRepository: Repository<UserHistory>,
    @InjectRepository(CaseHistory)
    private readonly caseHistoryRepository: Repository<CaseHistory>,
    @InjectRepository(UpgradeHistory)
    private readonly upgradeHistoryRepository: Repository<UpgradeHistory>,
    @InjectRepository(CrashSession)
    private readonly crashSessionRepository: Repository<CrashSession>,
    @InjectRepository(CsgoSkin)
    private readonly csgoSkinRepository: Repository<CsgoSkin>,
    @InjectRepository(DotaSkin)
    private readonly dotaSkinRepository: Repository<DotaSkin>,
  ) {}

  async addHistory(
    userId: number,
    action: string,
    relatedTable?: string,
    relatedId?: number,
  ) {
    const history = this.userHistoryRepository.create({
      user_id: userId,
      action,
      related_table: relatedTable,
      related_id: relatedId,
    })
    return this.userHistoryRepository.save(history)
  }

  /**
   * Records one open-case *event* (1..N boxes opened atomically).
   *
   * The whole event is a single row — `drops` carries the per-box
   * results in a JSONB array. Legacy single-skin columns are populated
   * from the first drop for backward compatibility with anything still
   * reading the old shape; new readers should consume `drops`.
   */
  async openCase(
    userId: number,
    caseId: number,
    caseName: string,
    casePrice: number,
    caseImg: string | undefined,
    drops: CaseHistoryDrop[],
    gameType: HistoryGameType = 'csgo',
  ) {
    const totalDrops = drops.length
    const totalCost = casePrice * totalDrops
    // Mirror first drop into legacy columns so any reader that hasn't
    // migrated to `drops[]` still gets a sensible single-skin view of
    // the event (preview image, last server_seed, etc.).
    const first = drops[0]

    // Stamp game_type on every drop (caller may have left it unset on
    // some entries). Cheap normalisation — keeps the JSON
    // self-describing for any future ad-hoc query.
    const dropsWithGame: CaseHistoryDrop[] = drops.map(d => ({
      ...d,
      game_type: d.game_type ?? gameType,
    }))

    const caseHistory = this.caseHistoryRepository.create({
      user_id: userId,
      case_id: caseId,
      case_name: caseName,
      case_price: casePrice,
      case_img: caseImg,
      game_type: gameType,
      total_drops: totalDrops,
      total_cost: totalCost,
      drops: dropsWithGame,
      server_seed: first?.server_seed,
      skin_id: first?.skin_id,
      skin_img: first?.skin_img,
      skin_price: first?.skin_price,
      skin_name: first?.skin_name,
    })
    const savedCaseHistory = await this.caseHistoryRepository.save(caseHistory)

    // Добавляем запись в общую историю с generic FK
    await this.addHistory(
      userId,
      'open_case',
      'case_history',
      savedCaseHistory.id,
    )

    return savedCaseHistory
  }

  async upgradeSkin(
    userId: number,
    skinId: number,
    skinName: string,
    oldRarity: string,
    newRarity: string,
    cost: number,
    gameType: HistoryGameType = 'csgo',
  ) {
    // Сохраняем детальную информацию в upgrade_history
    const upgradeHistory = this.upgradeHistoryRepository.create({
      user_id: userId,
      skin_id: skinId,
      skin_name: skinName,
      old_rarity: oldRarity,
      new_rarity: newRarity,
      cost,
      game_type: gameType,
    })
    const savedUpgradeHistory =
      await this.upgradeHistoryRepository.save(upgradeHistory)

    // Добавляем запись в общую историю с generic FK
    await this.addHistory(
      userId,
      'upgrade_skin',
      'upgrade_history',
      savedUpgradeHistory.id,
    )

    return savedUpgradeHistory
  }

  async getUserHistory(userId: number) {
    return this.userHistoryRepository.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
    })
  }

  async getCaseHistory(
    userId: number,
    pagination: NormalizedPagination = normalizePagination(),
  ): Promise<PaginatedResponse<CaseHistory>> {
    const [rows, total] = await this.caseHistoryRepository.findAndCount({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
      skip: pagination.skip,
      take: pagination.limit,
    })

    return buildPaginatedResponse(rows, total, pagination)
  }

  // Detail view for one upgrade — powers the Figma "Результат игры" modal
  // (node 68:31192). Snapshot-first: name / price / rarity come from the
  // upgrade row itself (so removed catalog skins still render correctly),
  // and `image` is JOINed live because it isn't snapshotted. NotFound when
  // either the row doesn't exist OR it belongs to a different user — same
  // 404 either way to avoid leaking ownership.
  async getUpgradeHistoryDetail(
    userId: number,
    id: number,
  ): Promise<UpgradeHistoryDetailDto> {
    const row = await this.upgradeHistoryRepository.findOne({
      where: { id, user_id: userId },
    })

    if (!row) {
      throw new NotFoundException('Upgrade history entry not found')
    }

    // Polymorphic image lookup — pick the right catalog based on the
    // upgrade's game_type. Pre-migration rows default to 'csgo' which
    // matches their actual game (only CSGO upgrades existed before
    // the discriminator was added).
    const targetImage = await this.lookupSkinImage(row.skin_id, row.game_type)

    const materials: UpgradeMaterialDetailDto[] = await this.hydrateMaterials(
      row.materials ?? [],
      row.game_type,
    )

    const cost = Number(row.cost)
    const skinPrice = row.skin_price != null ? Number(row.skin_price) : 0
    const multiplier = cost > 0 ? Number((skinPrice / cost).toFixed(2)) : 0

    return {
      id: row.id,
      cost,
      chance: row.chance != null ? Number(row.chance) : 0,
      skin_price: skinPrice,
      multiplier,
      success: row.success ?? false,
      // Mode is null only for pre-migration rows; default to 'inventory'
      // since balance mode landed together with the `mode` column.
      mode: row.mode ?? 'inventory',
      created_at: row.created_at,
      target: {
        id: row.skin_id,
        name: row.skin_name,
        rarity: row.new_rarity,
        price: skinPrice,
        image: targetImage,
      },
      materials,
    }
  }

  /**
   * Single-skin image lookup, polymorphic on game_type.
   *
   * Used by the upgrade-detail view to render the target skin's image.
   * `materials` get bulk-loaded by `hydrateMaterials` below — this
   * helper is the per-row equivalent for things like the upgrade
   * target where we only need one row.
   */
  private async lookupSkinImage(
    skinId: number,
    gameType: 'csgo' | 'dota' | null | undefined,
  ): Promise<string | null> {
    if (gameType === 'dota') {
      const dotaSkin = await this.dotaSkinRepository.findOne({
        where: { id: skinId },
        select: ['id', 'image'],
      })
      return dotaSkin?.image ?? null
    }
    const csgoSkin = await this.csgoSkinRepository.findOne({
      where: { id: skinId },
      select: ['id', 'image'],
    })
    return csgoSkin?.image ?? null
  }

  // Bulk-loads images for the snapshotted materials in a single query so we
  // don't fan out N selects for an upgrade with many materials. Skins removed
  // from the catalog surface as `image: null` instead of breaking the row.
  //
  // Polymorphic: dispatches to csgo_skins / dota_skins based on the
  // upgrade's game_type. Mixed-game materials inside one upgrade aren't
  // supported (the upgrade flow itself disallows them), so a single
  // batch-load against one catalog is enough.
  private async hydrateMaterials(
    snapshot: readonly UpgradeHistoryMaterial[],
    gameType: 'csgo' | 'dota' | null | undefined,
  ): Promise<UpgradeMaterialDetailDto[]> {
    if (snapshot.length === 0) return []

    const getMaterialGameType = (material: UpgradeHistoryMaterial) =>
      material.game_type ?? gameType ?? 'csgo'
    const getImageKey = (materialGameType: 'csgo' | 'dota', skinId: number) =>
      `${materialGameType}:${skinId}`
    const csgoSkinIds = snapshot
      .filter(material => getMaterialGameType(material) === 'csgo')
      .map(material => material.skin_id)
    const dotaSkinIds = snapshot
      .filter(material => getMaterialGameType(material) === 'dota')
      .map(material => material.skin_id)
    const imageByKey = new Map<string, string | null>()

    if (dotaSkinIds.length > 0) {
      const skins = await this.dotaSkinRepository.find({
        where: { id: In(dotaSkinIds) },
        select: ['id', 'image'],
      })
      for (const s of skins) imageByKey.set(getImageKey('dota', s.id), s.image)
    }

    if (csgoSkinIds.length > 0) {
      const skins = await this.csgoSkinRepository.find({
        where: { id: In(csgoSkinIds) },
        select: ['id', 'image'],
      })
      for (const s of skins) imageByKey.set(getImageKey('csgo', s.id), s.image)
    }

    return snapshot.map(material => ({
      skin_id: material.skin_id,
      name: material.name,
      rarity: material.rarity,
      price: Number(material.price),
      image:
        imageByKey.get(
          getImageKey(getMaterialGameType(material), material.skin_id),
        ) ?? null,
    }))
  }

  async getUpgradeHistory(
    userId: number,
    pagination: NormalizedPagination = normalizePagination(),
  ): Promise<PaginatedResponse<UpgradeHistoryItemDto>> {
    const [rows, total] = await this.upgradeHistoryRepository.findAndCount({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
      skip: pagination.skip,
      take: pagination.limit,
    })

    // Map to DTO so the wire contract stays narrow. `chance`, `skin_price`,
    // and `success` are nullable in the entity for backwards compat with
    // pre-migration rows — collapse to safe defaults here so the frontend
    // can type the row as fully populated. A pre-migration row therefore
    // surfaces as a "lost upgrade" with `0` skin_price, which matches the
    // history table's loss state.
    const items = rows.map(row => ({
      id: row.id,
      cost: Number(row.cost),
      chance: row.chance != null ? Number(row.chance) : 0,
      skin_price: row.skin_price != null ? Number(row.skin_price) : 0,
      success: row.success ?? false,
      skin_id: row.skin_id,
      created_at: row.created_at,
    }))

    return buildPaginatedResponse(items, total, pagination)
  }

  async getCrashHistory(
    userId: number,
    pagination: NormalizedPagination = normalizePagination(),
  ): Promise<PaginatedResponse<CrashHistoryItemDto>> {
    const [rows, total] = await this.crashSessionRepository.findAndCount({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
      skip: pagination.skip,
      take: pagination.limit,
    })

    const items = rows.map(row => ({
      id: row.id,
      stake_mode: row.stake_mode,
      slot: row.slot,
      stake_amount: Number(row.stake_amount),
      cashout_multiplier:
        row.cashout_multiplier === null ? null : Number(row.cashout_multiplier),
      win_amount: row.win_amount === null ? null : Number(row.win_amount),
      status: row.status,
      mfr_seed_hash: row.mfr_seed_hash,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }))

    return buildPaginatedResponse(items, total, pagination)
  }

  // Метод для получения детальной информации по generic FK
  async getHistoryWithDetails(userId: number) {
    const history = await this.getUserHistory(userId)

    const detailedHistory = await Promise.all(
      history.map(async record => {
        if (record.related_table && record.related_id) {
          let details = null

          switch (record.related_table) {
            case 'case_history':
              details = await this.caseHistoryRepository.findOne({
                where: { id: record.related_id },
              })
              break
            case 'upgrade_history':
              details = await this.upgradeHistoryRepository.findOne({
                where: { id: record.related_id },
              })
              break
          }

          return { ...record, details }
        }
        return record
      }),
    )

    return detailedHistory
  }

  // Метод для фильтрованной истории
  async getFilteredHistory(
    userId: number,
    filters: {
      action?: string
      relatedTable?: string
      limit?: number
    },
  ) {
    const query = this.userHistoryRepository.createQueryBuilder('history')
    query.where('history.user_id = :userId', { userId })

    if (filters.action) {
      query.andWhere('history.action = :action', { action: filters.action })
    }

    if (filters.relatedTable) {
      query.andWhere('history.related_table = :relatedTable', {
        relatedTable: filters.relatedTable,
      })
    }

    query.orderBy('history.created_at', 'DESC')

    if (filters.limit) {
      query.limit(filters.limit)
    }

    return query.getMany()
  }

  // Метод для статистики по играм
  async getGameStats(userId: number) {
    const stats = await this.userHistoryRepository
      .createQueryBuilder('history')
      .select('history.action', 'action')
      .addSelect('COUNT(*)', 'count')
      .where('history.user_id = :userId', { userId })
      .groupBy('history.action')
      .getRawMany()

    const caseStats = await this.caseHistoryRepository
      .createQueryBuilder('case')
      .select('COUNT(*)', 'totalCases')
      .addSelect('SUM(case.case_price)', 'totalSpent')
      .addSelect('SUM(case.skin_price)', 'totalWon')
      .where('case.user_id = :userId', { userId })
      .getRawOne()

    const upgradeStats = await this.upgradeHistoryRepository
      .createQueryBuilder('upgrade')
      .select('COUNT(*)', 'totalUpgrades')
      .addSelect('SUM(upgrade.cost)', 'totalCost')
      .where('upgrade.user_id = :userId', { userId })
      .getRawOne()

    return {
      actionStats: stats,
      caseStats,
      upgradeStats,
    }
  }
}
