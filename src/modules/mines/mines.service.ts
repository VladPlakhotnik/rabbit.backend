import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectEntityManager } from '@nestjs/typeorm'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { EntityManager, In } from 'typeorm'
import { UserInventory } from '../userInventory/userInventory.entity'
import { User } from '../users/user.entity'
import { UPGRADE_LIMITS } from '../upgrade/upgrade.constants'
import { CashoutDto, MakeMoveDto, StartGameDto } from './dto'
import {
  MinesSession,
  MinesSessionStatus,
  MinesStakeItemSnapshot,
  MinesStakeMode,
} from './entities/mines-session.entity'
import {
  MINES_BOARD_SIZE,
  MINES_GRID_SIZE,
  MINES_HOUSE_RETURN,
  buildMinesMultiplierPath,
  calculateProjectedWin,
  countSafeMinesReveals,
  drawMinePositions,
  roundMoney,
  toCellIndex,
} from './mines-game.logic'
import { MinesLiveService } from './live/mines-live.service'
import type { MinesLiveDropPayload } from './live/mines-live.types'
import {
  MINES_PRODUCT_HOUSE_EDGE_BPS,
  calculateFixedHouseEdgeVipEarning,
} from '../vip/vip-earning.logic'
import { VipService } from '../vip/vip.service'
import {
  buildPaginatedResponse,
  normalizePagination,
  type NormalizedPagination,
  type PaginatedResponse,
} from '../../common/pagination'
import { MAX_MINES, MIN_MINES } from './mines.constants'
import type { AdminMinesListQueryDto } from './dto/admin-mines.dto'

export interface PublicMinesSession {
  game_session_id: number
  status: MinesSessionStatus
  stake_mode: MinesStakeMode
  mines_count: number
  board_size: number
  bet_amount: number
  current_multiplier: number
  next_multiplier: number | null
  potential_win: number
  win_amount: number | null
  revealed_cells: number[]
  mine_cells?: number[]
  multipliers: number[]
  stake_items: MinesStakeItemSnapshot[]
  created_at: Date
  updated_at: Date
  new_balance?: number
  user?: {
    id: number
    display_name: string
    avatar: string | null
  }
}

export interface AdminMinesSettings {
  algorithm: string
  board_size: number
  grid_size: number
  house_edge_bps: number
  house_return: number
  max_bet_amount: number
  max_inventory_items: number
  max_mines: number
  min_bet_amount: number
  min_inventory_items: number
  min_mines: number
  stake_modes: MinesStakeMode[]
}

export interface AdminMinesSession extends PublicMinesSession {
  mfr_algorithm: string
  mfr_seed_hash: string
  profit: number
  safe_reveals: number
  user: {
    id: number
    display_name: string
    avatar: string | null
  }
}

export interface AdminMinesOverview {
  active_sessions: number
  average_bet: number
  completed_sessions: number
  lost_sessions: number
  observed_rtp: number
  settings: AdminMinesSettings
  stale_active_sessions: number
  total_paid: number
  total_sessions: number
  total_wagered: number
  top_win: number
  won_sessions: number
}

export interface MoveResult {
  success: boolean
  is_mine: boolean
  is_diamond: boolean
  message: string
  session: PublicMinesSession
}

export interface CashoutResult {
  success: boolean
  final_multiplier: number
  win_amount: number
  new_balance: number
  message: string
  session: PublicMinesSession
}

@Injectable()
export class MinesService {
  constructor(
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
    private readonly minesLiveService: MinesLiveService,
    private readonly vipService: VipService,
  ) {}

  getAdminSettings(): AdminMinesSettings {
    return {
      algorithm: 'MFR_CRYPTO_RANDOM_INT',
      board_size: MINES_BOARD_SIZE,
      grid_size: MINES_GRID_SIZE,
      house_edge_bps: MINES_PRODUCT_HOUSE_EDGE_BPS,
      house_return: MINES_HOUSE_RETURN,
      max_bet_amount: UPGRADE_LIMITS.MAX_AMOUNT,
      max_inventory_items: UPGRADE_LIMITS.MAX_MATERIALS,
      max_mines: MAX_MINES,
      min_bet_amount: UPGRADE_LIMITS.MIN_AMOUNT,
      min_inventory_items: UPGRADE_LIMITS.MIN_MATERIALS,
      min_mines: MIN_MINES,
      stake_modes: ['balance', 'inventory'],
    }
  }

  async getAdminOverview(): Promise<AdminMinesOverview> {
    const aggregateQuery = this.entityManager
      .createQueryBuilder(MinesSession, 'session')
      .select(
        `COALESCE(SUM(CASE WHEN session.status <> 'active' THEN session.bet_amount ELSE 0 END), 0)`,
        'total_wagered',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN session.status = 'cashed_out' THEN session.win_amount ELSE 0 END), 0)`,
        'total_paid',
      )
      .addSelect(
        `COALESCE(MAX(CASE WHEN session.status = 'cashed_out' THEN session.win_amount ELSE 0 END), 0)`,
        'top_win',
      )
      .addSelect(
        `COALESCE(AVG(CASE WHEN session.status <> 'active' THEN session.bet_amount ELSE NULL END), 0)`,
        'average_bet',
      )

    const [
      totalSessions,
      activeSessions,
      wonSessions,
      lostSessions,
      staleActiveSessions,
      aggregate,
    ] = await Promise.all([
      this.entityManager.count(MinesSession),
      this.entityManager.count(MinesSession, { where: { status: 'active' } }),
      this.entityManager.count(MinesSession, {
        where: { status: 'cashed_out' },
      }),
      this.entityManager.count(MinesSession, { where: { status: 'lost' } }),
      this.entityManager
        .createQueryBuilder(MinesSession, 'session')
        .where('session.status = :status', { status: 'active' })
        .andWhere("session.created_at < NOW() - INTERVAL '30 minutes'")
        .getCount(),
      aggregateQuery.getRawOne<{
        average_bet: string | number | null
        top_win: string | number | null
        total_paid: string | number | null
        total_wagered: string | number | null
      }>(),
    ])

    const totalWagered = this.toNumber(aggregate?.total_wagered)
    const totalPaid = this.toNumber(aggregate?.total_paid)

    return {
      active_sessions: activeSessions,
      average_bet: roundMoney(this.toNumber(aggregate?.average_bet)),
      completed_sessions: wonSessions + lostSessions,
      lost_sessions: lostSessions,
      observed_rtp:
        totalWagered > 0 ? roundMoney((totalPaid / totalWagered) * 100) : 0,
      settings: this.getAdminSettings(),
      stale_active_sessions: staleActiveSessions,
      total_paid: roundMoney(totalPaid),
      total_sessions: totalSessions,
      total_wagered: roundMoney(totalWagered),
      top_win: roundMoney(this.toNumber(aggregate?.top_win)),
      won_sessions: wonSessions,
    }
  }

  async findAllForAdmin(
    filters: AdminMinesListQueryDto = {},
  ): Promise<PaginatedResponse<AdminMinesSession>> {
    const pagination = normalizePagination({
      limit: filters.limit,
      page: filters.page,
    })
    const queryBuilder = this.entityManager
      .createQueryBuilder(MinesSession, 'session')
      .leftJoinAndSelect('session.user', 'user')
    let hasWhere = false

    const addWhere = (condition: string, parameters?: Record<string, unknown>) => {
      if (!hasWhere) {
        queryBuilder.where(condition, parameters)
        hasWhere = true
        return
      }
      queryBuilder.andWhere(condition, parameters)
    }

    if (filters.status) {
      addWhere('session.status = :status', { status: filters.status })
    }

    if (filters.stakeMode) {
      addWhere('session.stake_mode = :stakeMode', {
        stakeMode: filters.stakeMode,
      })
    }

    if (filters.userId !== undefined) {
      addWhere('session.user_id = :userId', { userId: filters.userId })
    }

    if (filters.minBet !== undefined) {
      addWhere('session.bet_amount >= :minBet', { minBet: filters.minBet })
    }

    if (filters.maxBet !== undefined) {
      addWhere('session.bet_amount <= :maxBet', { maxBet: filters.maxBet })
    }

    if (filters.minWin !== undefined) {
      addWhere('COALESCE(session.win_amount, 0) >= :minWin', {
        minWin: filters.minWin,
      })
    }

    if (filters.maxWin !== undefined) {
      addWhere('COALESCE(session.win_amount, 0) <= :maxWin', {
        maxWin: filters.maxWin,
      })
    }

    if (filters.minMines !== undefined) {
      addWhere('session.mines_count >= :minMines', {
        minMines: filters.minMines,
      })
    }

    if (filters.maxMines !== undefined) {
      addWhere('session.mines_count <= :maxMines', {
        maxMines: filters.maxMines,
      })
    }

    const search = filters.search?.trim()
    if (search) {
      addWhere(
        `(CAST(session.id AS TEXT) ILIKE :search OR CAST(session.user_id AS TEXT) ILIKE :search OR COALESCE(user.display_name, '') ILIKE :search)`,
        { search: `%${search}%` },
      )
    }

    const [sessions, total] = await queryBuilder
      .orderBy('session.created_at', 'DESC')
      .skip(pagination.skip)
      .take(pagination.limit)
      .getManyAndCount()

    return buildPaginatedResponse(
      sessions.map(session => this.toAdminSession(session)),
      total,
      pagination,
    )
  }

  async findAdminById(id: number): Promise<AdminMinesSession> {
    const session = await this.entityManager
      .createQueryBuilder(MinesSession, 'session')
      .leftJoinAndSelect('session.user', 'user')
      .where('session.id = :id', { id })
      .getOne()

    if (!session) {
      throw new NotFoundException('Mines session not found')
    }

    return this.toAdminSession(session)
  }

  async startGame(
    userId: number,
    startGameDto: StartGameDto,
  ): Promise<PublicMinesSession> {
    return this.entityManager.transaction(async manager => {
      const user = await this.lockUser(manager, userId)
      await this.assertNoActiveSession(manager, userId)

      const mode = this.resolveStakeMode(startGameDto)
      const multipliers = buildMinesMultiplierPath({
        boardSize: MINES_BOARD_SIZE,
        minesCount: startGameDto.mines_count,
      })

      let betAmount = 0
      let stakeItems: MinesStakeItemSnapshot[] | null = null

      if (mode === 'balance') {
        betAmount = this.getBalanceStake(startGameDto)
        if (Number(user.balance) < betAmount) {
          throw new BadRequestException('Insufficient balance for mines game')
        }

        user.balance = roundMoney(Number(user.balance) - betAmount)
        await manager.save(user)
      } else {
        const inventoryItems = await this.lockInventoryStake(
          manager,
          userId,
          this.normalizeInventoryIds(startGameDto),
        )
        stakeItems = this.buildStakeItems(inventoryItems)
        betAmount = this.calculateInventoryStake(stakeItems)

        inventoryItems.forEach(item => {
          item.is_sold = true
        })
        await manager.save(UserInventory, inventoryItems)
      }

      const session = manager.create(MinesSession, {
        user_id: userId,
        stake_mode: mode,
        bet_amount: betAmount,
        mines_count: startGameDto.mines_count,
        board_size: MINES_BOARD_SIZE,
        mine_positions: drawMinePositions(
          MINES_BOARD_SIZE,
          startGameDto.mines_count,
        ),
        revealed_cells: [],
        current_multiplier: 1,
        win_amount: null,
        status: 'active',
        mfr_seed_hash: this.createMfrSeedHash(),
        stake_items: stakeItems,
      })

      const savedSession = await manager.save(session)

      return this.toPublicSession(savedSession, {
        multipliers,
        newBalance: Number(user.balance),
      })
    })
  }

  async makeMove(
    userId: number,
    makeMoveDto: MakeMoveDto,
  ): Promise<MoveResult> {
    const result = await this.entityManager.transaction(async manager => {
      const session = await this.lockSession(
        manager,
        userId,
        makeMoveDto.game_session_id,
      )

      if (session.status !== 'active') {
        throw new BadRequestException('Game session is not active')
      }

      const cellIndex = toCellIndex({ x: makeMoveDto.x, y: makeMoveDto.y })

      if (cellIndex < 0 || cellIndex >= session.board_size) {
        throw new BadRequestException('Invalid cell')
      }

      if (session.revealed_cells.includes(cellIndex)) {
        throw new BadRequestException('Cell already revealed')
      }

      const isMine = session.mine_positions.includes(cellIndex)
      session.revealed_cells = [...session.revealed_cells, cellIndex]

      if (isMine) {
        const user = await this.lockUser(manager, userId)
        session.status = 'lost'
        session.win_amount = 0
        await manager.save(session)
        await this.recordVipEarning(manager, user, session)

        return {
          success: false,
          is_mine: true,
          is_diamond: false,
          message: 'Game over! You hit a mine.',
          session: this.toPublicSession(session, { revealMines: true }),
        }
      }

      const multipliers = buildMinesMultiplierPath({
        boardSize: session.board_size,
        minesCount: session.mines_count,
      })
      const safeReveals = this.countSafeReveals(session)
      session.current_multiplier =
        multipliers[safeReveals - 1] ?? session.current_multiplier

      const allSafeCellsOpened =
        safeReveals >= session.board_size - session.mines_count
      let newBalance: number | undefined

      if (allSafeCellsOpened) {
        const user = await this.lockUser(manager, userId)
        const winAmount = calculateProjectedWin(
          session.bet_amount,
          session.current_multiplier,
        )
        user.balance = roundMoney(Number(user.balance) + winAmount)
        session.status = 'cashed_out'
        session.win_amount = winAmount
        await this.recordVipEarning(manager, user, session)
        await manager.save(user)
        newBalance = Number(user.balance)
      }

      await manager.save(session)

      return {
        success: true,
        is_mine: false,
        is_diamond: true,
        message: allSafeCellsOpened
          ? 'All safe cells opened. Winnings paid.'
          : 'Safe cell opened.',
        session: this.toPublicSession(session, {
          revealMines: allSafeCellsOpened,
          newBalance,
        }),
      }
    })

    await this.publishFinishedGame(userId, result.session)

    return result
  }

  async cashout(
    userId: number,
    cashoutDto: CashoutDto,
  ): Promise<CashoutResult> {
    const result = await this.entityManager.transaction(async manager => {
      const session = await this.lockSession(
        manager,
        userId,
        cashoutDto.game_session_id,
      )

      if (session.status !== 'active') {
        throw new BadRequestException('Game session is not active')
      }

      if (this.countSafeReveals(session) <= 0) {
        throw new BadRequestException(
          'Open at least one safe cell before cashout',
        )
      }

      const user = await this.lockUser(manager, userId)
      const winAmount = calculateProjectedWin(
        session.bet_amount,
        session.current_multiplier,
      )

      user.balance = roundMoney(Number(user.balance) + winAmount)
      session.status = 'cashed_out'
      session.win_amount = winAmount

      await this.recordVipEarning(manager, user, session)
      await manager.save(user)
      await manager.save(session)

      return {
        success: true,
        final_multiplier: Number(session.current_multiplier),
        win_amount: winAmount,
        new_balance: Number(user.balance),
        message: 'Cashout successful.',
        session: this.toPublicSession(session, {
          revealMines: true,
          newBalance: Number(user.balance),
        }),
      }
    })

    await this.publishFinishedGame(userId, result.session)

    return result
  }

  async getGameSession(
    userId: number,
    sessionId: number,
  ): Promise<PublicMinesSession> {
    const session = await this.entityManager.findOne(MinesSession, {
      where: { id: sessionId, user_id: userId },
    })

    if (!session) {
      throw new NotFoundException('Game session not found')
    }

    return this.toPublicSession(session, {
      revealMines: session.status !== 'active',
    })
  }

  async getActiveGameSession(
    userId: number,
  ): Promise<PublicMinesSession | null> {
    const session = await this.entityManager.findOne(MinesSession, {
      where: { user_id: userId, status: 'active' },
      order: { created_at: 'DESC' },
    })

    return session ? this.toPublicSession(session) : null
  }

  async getGameHistory(
    userId: number,
    pagination: NormalizedPagination = normalizePagination(),
  ): Promise<PaginatedResponse<PublicMinesSession>> {
    const [sessions, total] = await this.entityManager.findAndCount(
      MinesSession,
      {
        where: { user_id: userId, status: In(['cashed_out', 'lost']) },
        order: { created_at: 'DESC' },
        skip: pagination.skip,
        take: pagination.limit,
      },
    )

    const items = sessions.map(session =>
      this.toPublicSession(session, {
        revealMines: session.status !== 'active',
      }),
    )

    return buildPaginatedResponse(items, total, pagination)
  }

  async getTopWinners(): Promise<PublicMinesSession[]> {
    const sessions = await this.entityManager.find(MinesSession, {
      where: { status: 'cashed_out' },
      relations: { user: true },
      order: { win_amount: 'DESC', created_at: 'DESC' },
      take: 25,
    })

    return sessions.map(session =>
      this.toPublicSession(session, {
        revealMines: true,
        includeUser: true,
      }),
    )
  }

  private async publishFinishedGame(
    userId: number,
    session: PublicMinesSession,
  ): Promise<void> {
    if (session.status === 'active') {
      return
    }

    const user = await this.loadUserForLiveDrop(userId)
    const username = user?.display_name || `Player${userId}`
    const avatar = user?.avatar || null
    const winAmount = session.status === 'lost' ? 0 : (session.win_amount ?? 0)
    const multiplier =
      session.status === 'lost' ? 0 : Number(session.current_multiplier) || 0
    const sessionWithUser: PublicMinesSession = {
      ...session,
      user: {
        id: userId,
        display_name: username,
        avatar,
      },
    }

    const payload: MinesLiveDropPayload = {
      id: randomUUID(),
      user: { id: userId, username, avatar },
      session: sessionWithUser,
      multiplier,
      profit: roundMoney(winAmount - session.bet_amount),
      isBot: false,
      ts: Date.now(),
    }

    await this.minesLiveService.pushDrop(payload)
  }

  private async loadUserForLiveDrop(userId: number): Promise<User | null> {
    try {
      return await this.entityManager.findOne(User, {
        where: { id: userId },
      })
    } catch {
      return null
    }
  }

  private async lockUser(
    manager: EntityManager,
    userId: number,
  ): Promise<User> {
    const user = await manager.findOne(User, {
      where: { id: userId },
      lock: { mode: 'pessimistic_write' },
    })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    return user
  }

  private async recordVipEarning(
    manager: EntityManager,
    user: User,
    session: MinesSession,
  ): Promise<void> {
    const earning = calculateFixedHouseEdgeVipEarning({
      sourceType: 'mines_round',
      wagerAmount: Number(session.bet_amount),
      houseEdgeBps: MINES_PRODUCT_HOUSE_EDGE_BPS,
    })

    await this.vipService.recordEarning(manager, user, {
      ...earning,
      sourceId: `mines:${session.id}`,
      metadata: {
        stakeMode: session.stake_mode,
        minesCount: session.mines_count,
        status: session.status,
        winAmount: session.win_amount ?? 0,
        safeReveals: this.countSafeReveals(session),
      },
    })
  }

  private async assertNoActiveSession(
    manager: EntityManager,
    userId: number,
  ): Promise<void> {
    const activeSession = await manager.findOne(MinesSession, {
      where: { user_id: userId, status: 'active' },
      lock: { mode: 'pessimistic_write' },
    })

    if (activeSession) {
      throw new BadRequestException('Finish current mines game first')
    }
  }

  private async lockSession(
    manager: EntityManager,
    userId: number,
    sessionId: number,
  ): Promise<MinesSession> {
    const session = await manager.findOne(MinesSession, {
      where: { id: sessionId, user_id: userId },
      lock: { mode: 'pessimistic_write' },
    })

    if (!session) {
      throw new NotFoundException('Game session not found')
    }

    return session
  }

  private resolveStakeMode(dto: StartGameDto): MinesStakeMode {
    const hasBalanceStake = dto.bet_amount !== undefined
    const hasInventoryStake =
      dto.inventory_skin_id !== undefined ||
      (dto.inventory_skin_ids !== undefined &&
        dto.inventory_skin_ids.length > 0)

    if (dto.mode === 'balance' && !hasBalanceStake) {
      throw new BadRequestException('bet_amount is required for balance mode')
    }

    if (dto.mode === 'inventory' && !hasInventoryStake) {
      throw new BadRequestException(
        'inventory_skin_ids is required for inventory mode',
      )
    }

    if (hasBalanceStake === hasInventoryStake) {
      throw new BadRequestException(
        'Provide either bet_amount or inventory_skin_ids',
      )
    }

    return hasBalanceStake ? 'balance' : 'inventory'
  }

  private getBalanceStake(dto: StartGameDto): number {
    const stake = Number(dto.bet_amount)

    if (!Number.isFinite(stake)) {
      throw new BadRequestException('Invalid bet amount')
    }

    return this.assertStakeAmount(stake)
  }

  private normalizeInventoryIds(dto: StartGameDto): number[] {
    const ids = dto.inventory_skin_ids ?? []
    const legacyId = dto.inventory_skin_id
    const normalized = legacyId !== undefined ? [...ids, legacyId] : ids
    const unique = new Set(normalized)

    if (unique.size !== normalized.length) {
      throw new BadRequestException('Inventory skin ids must be unique')
    }

    if (
      normalized.length < UPGRADE_LIMITS.MIN_MATERIALS ||
      normalized.length > UPGRADE_LIMITS.MAX_MATERIALS
    ) {
      throw new BadRequestException(
        `Inventory stake must use ${UPGRADE_LIMITS.MIN_MATERIALS}-${UPGRADE_LIMITS.MAX_MATERIALS} skins`,
      )
    }

    return normalized
  }

  private async lockInventoryStake(
    manager: EntityManager,
    userId: number,
    inventoryIds: number[],
  ): Promise<UserInventory[]> {
    const inventoryItems = await manager
      .createQueryBuilder(UserInventory, 'inv')
      .leftJoinAndSelect('inv.csgoSkin', 'csgoSkin')
      .leftJoinAndSelect('inv.dotaSkin', 'dotaSkin')
      .where('inv.id IN (:...ids)', { ids: inventoryIds })
      .andWhere('inv.user_id = :userId', { userId })
      .andWhere('inv.is_sold = false')
      .andWhere('inv.is_withdrawn = false')
      .setLock('pessimistic_write', undefined, ['inv'])
      .getMany()

    if (inventoryItems.length !== inventoryIds.length) {
      throw new NotFoundException(
        'Some skins not found in inventory or already used',
      )
    }

    return inventoryItems
  }

  private buildStakeItems(
    inventoryItems: UserInventory[],
  ): MinesStakeItemSnapshot[] {
    return inventoryItems.map(item => {
      const skin = item.skin ?? item.csgoSkin ?? item.dotaSkin
      const price = Number(skin?.market_price)

      if (!skin || !Number.isFinite(price) || price <= 0) {
        throw new BadRequestException('Some skins have invalid or zero price')
      }

      return {
        inventory_id: item.id,
        skin_id: skin.id,
        game_type: item.game_type,
        name: skin.market_hash_name,
        image: skin.image ?? null,
        rarity: skin.quality ?? null,
        price: roundMoney(price),
      }
    })
  }

  private calculateInventoryStake(
    stakeItems: MinesStakeItemSnapshot[],
  ): number {
    const total = stakeItems.reduce((sum, item) => sum + item.price, 0)

    return this.assertStakeAmount(roundMoney(total))
  }

  private assertStakeAmount(amount: number): number {
    if (amount < UPGRADE_LIMITS.MIN_AMOUNT) {
      throw new BadRequestException(
        `Stake must be at least ${UPGRADE_LIMITS.MIN_AMOUNT}`,
      )
    }

    if (amount > UPGRADE_LIMITS.MAX_AMOUNT) {
      throw new BadRequestException(
        `Stake must not exceed ${UPGRADE_LIMITS.MAX_AMOUNT}`,
      )
    }

    return roundMoney(amount)
  }

  private createMfrSeedHash(): string {
    return createHash('sha256').update(randomBytes(32)).digest('hex')
  }

  private toPublicSession(
    session: MinesSession,
    options: {
      revealMines?: boolean
      multipliers?: number[]
      includeUser?: boolean
      newBalance?: number
    } = {},
  ): PublicMinesSession {
    const multipliers =
      options.multipliers ??
      buildMinesMultiplierPath({
        boardSize: session.board_size,
        minesCount: session.mines_count,
      })
    const safeReveals = this.countSafeReveals(session)
    const nextMultiplier =
      session.status === 'active' ? (multipliers[safeReveals] ?? null) : null
    const currentMultiplier = Number(session.current_multiplier) || 1
    const potentialWin =
      session.status === 'active' && nextMultiplier
        ? calculateProjectedWin(session.bet_amount, nextMultiplier)
        : calculateProjectedWin(session.bet_amount, currentMultiplier)

    return {
      game_session_id: session.id,
      status: session.status,
      stake_mode: session.stake_mode,
      mines_count: session.mines_count,
      board_size: session.board_size,
      bet_amount: Number(session.bet_amount),
      current_multiplier: currentMultiplier,
      next_multiplier: nextMultiplier,
      potential_win: potentialWin,
      win_amount:
        session.win_amount === null
          ? null
          : roundMoney(Number(session.win_amount)),
      revealed_cells: session.revealed_cells,
      mine_cells: options.revealMines ? session.mine_positions : undefined,
      multipliers,
      stake_items: session.stake_items ?? [],
      created_at: session.created_at,
      updated_at: session.updated_at,
      new_balance: options.newBalance,
      user:
        options.includeUser && session.user
          ? {
              id: session.user.id,
              display_name: session.user.display_name,
              avatar: session.user.avatar,
            }
          : undefined,
    }
  }

  private toAdminSession(session: MinesSession): AdminMinesSession {
    const publicSession = this.toPublicSession(session, {
      includeUser: true,
      revealMines: session.status !== 'active',
    })
    const winAmount =
      session.win_amount === null ? 0 : roundMoney(Number(session.win_amount))
    const profit =
      session.status === 'active'
        ? 0
        : roundMoney(winAmount - Number(session.bet_amount))

    return {
      ...publicSession,
      mfr_algorithm: session.mfr_algorithm,
      mfr_seed_hash: session.mfr_seed_hash,
      profit,
      safe_reveals: this.countSafeReveals(session),
      user: publicSession.user ?? {
        avatar: session.user?.avatar ?? null,
        display_name: session.user?.display_name ?? `User #${session.user_id}`,
        id: session.user_id,
      },
    }
  }

  private toNumber(value: string | number | null | undefined): number {
    const parsed = Number(value)

    return Number.isFinite(parsed) ? parsed : 0
  }

  private countSafeReveals(session: MinesSession): number {
    return countSafeMinesReveals(session.revealed_cells, session.mine_positions)
  }
}
