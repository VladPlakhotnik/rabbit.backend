import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import type { Cache } from 'cache-manager'
import { InjectRepository } from '@nestjs/typeorm'
import { Brackets, EntityManager, IsNull, Repository } from 'typeorm'
import { User } from './user.entity'
import { UserDeposit } from './user-deposit.entity'
import { UserRefreshToken } from '../auth/entities/user-refresh-token.entity'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'
import { jwtUserCacheKey } from '../auth/jwt-user-cache-key'
import type { VipEarning } from '../vip/vip-earning.logic'
import { VipService } from '../vip/vip.service'
import type { DiscordUserProfile } from '../social/services/discord.service'
import { RewardsCooldown } from '../rewards/entities/rewardsCooldown.entity'
import {
  buildPaginatedResponse,
  normalizePagination,
  type PaginatedResponse,
} from '../../common/pagination'
import type { AdminDepositListQueryDto } from './dto/admin-deposit.dto'
import {
  AdminBlockUserDto,
  AdminUpdateUserDto,
  AdminUserListQueryDto,
} from './dto/admin-user.dto'
import { isPlayerRole } from './player-role.enum'
import { normalizeUserBlockInput } from './user-block'
import {
  shouldSetUserCountry,
  type UserCountryCandidate,
} from '../../common/helpers/user-country'

interface BalanceDeductionOptions {
  vipEarning?: VipEarning & {
    sourceId?: string | null
    metadata?: Record<string, unknown>
  }
}

export interface UserDepositHistoryItem {
  id: number
  user_id: number
  method: string
  amount: number
  bonus_amount: number
  status: UserDeposit['status']
  created_at: Date
  updated_at: Date
  external_id: string | null
  failure_reason: string | null
}

export interface AdminDepositItem extends UserDepositHistoryItem {
  method: string
  user: {
    avatar: string | null
    display_name: string
    id: number
  } | null
}

export interface AdminDepositsOverview {
  amount: {
    success: number
    total: number
    waiting: number
  }
  bonus: {
    success: number
  }
  cancelled: number
  error: number
  success: number
  total: number
  waiting: number
}

/**
 * Service for working with users
 * @class UserService
 */

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name)

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserDeposit)
    private readonly userDepositRepository: Repository<UserDeposit>,
    @InjectRepository(UserRefreshToken)
    private readonly userRefreshTokenRepository: Repository<UserRefreshToken>,
    private readonly httpService: HttpService,
    private readonly vipService: VipService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  /**
   * Manual fallback for invalidating the JwtStrategy's cached User
   * row. ONLY needed in code paths that mutate `users` rows via raw
   * SQL (`manager.query('UPDATE users ...')`) - those bypass TypeORM
   * subscribers, so JwtUserCacheSubscriber never fires for them.
   *
   * Every other mutation in this service goes through
   * repository.update / save / increment / manager.save in a
   * transaction -> all of those trigger the subscriber automatically;
   * do NOT call this method from those paths.
   *
   * Failures are intentionally swallowed: a cache miss here is a
   * worst-case 30-second staleness, never a 500.
   */
  private async invalidateJwtUserCache(userId: number): Promise<void> {
    try {
      await this.cache.del(jwtUserCacheKey(userId))
    } catch (err) {
      this.logger.warn(
        `Failed to invalidate jwt user cache for ${userId}: ${
          err instanceof Error ? err.message : 'Unknown error'
        }`,
      )
    }
  }

  findAll() {
    return this.userRepository.find()
  }

  async findAllForAdmin(filters: AdminUserListQueryDto = {}) {
    const page = Math.max(1, filters.page ?? 1)
    const limit = Math.min(100, Math.max(1, filters.limit ?? 25))
    const query = this.userRepository.createQueryBuilder('user')
    const search = filters.search?.trim()

    if (search) {
      query.andWhere(
        new Brackets(qb => {
          qb.where('LOWER(user.display_name) LIKE LOWER(:search)', {
            search: `%${search}%`,
          })
            .orWhere('CAST(user.id AS TEXT) LIKE :search', {
              search: `%${search}%`,
            })
            .orWhere('CAST(user.steam_id AS TEXT) LIKE :search', {
              search: `%${search}%`,
            })
            .orWhere('CAST(user.telegram_user_id AS TEXT) LIKE :search', {
              search: `%${search}%`,
            })
            .orWhere('LOWER(user.discord_username) LIKE LOWER(:search)', {
              search: `%${search}%`,
            })
            .orWhere('LOWER(user.discord_user_id) LIKE LOWER(:search)', {
              search: `%${search}%`,
            })
            .orWhere('LOWER(user.google_id) LIKE LOWER(:search)', {
              search: `%${search}%`,
            })
        }),
      )
    }

    if (filters.role?.trim()) {
      query.andWhere('user.role = :role', { role: filters.role.trim() })
    }

    if (filters.minBalance !== undefined) {
      query.andWhere('user.balance >= :minBalance', {
        minBalance: filters.minBalance,
      })
    }

    if (filters.maxBalance !== undefined) {
      query.andWhere('user.balance <= :maxBalance', {
        maxBalance: filters.maxBalance,
      })
    }

    const [items, total] = await query
      .orderBy('user.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount()

    return {
      items,
      total,
      page,
      limit,
      hasMore: page * limit < total,
      filters: {
        search: search || null,
        role: filters.role?.trim() || null,
        minBalance: filters.minBalance ?? null,
        maxBalance: filters.maxBalance ?? null,
      },
    }
  }

  async findAdminById(id: number): Promise<User> {
    const user = await this.findById(id)
    if (!user) {
      throw new NotFoundException('User not found')
    }

    return user
  }

  async updateForAdmin(
    id: number,
    payload: AdminUpdateUserDto,
  ): Promise<User> {
    const user = await this.findAdminById(id)

    if (payload.display_name !== undefined) {
      const displayName = payload.display_name.trim()
      if (!displayName) {
        throw new BadRequestException('Display name is required')
      }
      user.display_name = displayName
    }

    if (payload.role !== undefined) {
      const role = payload.role.trim()
      if (!isPlayerRole(role)) {
        throw new BadRequestException('Invalid player role')
      }
      user.role = role
    }

    if (payload.balance !== undefined) {
      if (!Number.isFinite(payload.balance) || payload.balance < 0) {
        throw new BadRequestException('Balance must be a non-negative number')
      }
      user.balance = Math.round(payload.balance * 100) / 100
    }

    if (payload.avatar !== undefined) {
      user.avatar = payload.avatar.trim()
    }

    if (payload.trade_link !== undefined) {
      const tradeLink = payload.trade_link?.trim()
      user.trade_link = tradeLink || null
    }

    if (payload.telegram_bonus_claimed !== undefined) {
      user.telegram_bonus_claimed = payload.telegram_bonus_claimed
    }

    if (payload.discord_bonus_claimed !== undefined) {
      user.discord_bonus_claimed = payload.discord_bonus_claimed
    }

    return this.userRepository.save(user)
  }

  async blockForAdmin(
    id: number,
    payload: AdminBlockUserDto,
    adminId: string | null,
  ): Promise<User> {
    const user = await this.findAdminById(id)
    const block = normalizeUserBlockInput(payload)

    const now = new Date()
    user.is_blocked = true
    user.blocked_reason = block.reason
    user.blocked_reason_template = block.template
    user.blocked_at = now
    user.blocked_by_admin_id = adminId
    user.unblocked_at = null
    user.unblocked_by_admin_id = null

    const savedUser = await this.userRepository.save(user)
    await this.userRefreshTokenRepository.update(
      { user_id: id, revoked_at: IsNull() },
      { revoked_at: now },
    )

    return savedUser
  }

  async unblockForAdmin(id: number, adminId: string | null): Promise<User> {
    const user = await this.findAdminById(id)

    user.is_blocked = false
    user.blocked_reason = null
    user.blocked_reason_template = null
    user.blocked_at = null
    user.blocked_by_admin_id = null
    user.unblocked_at = new Date()
    user.unblocked_by_admin_id = adminId

    return this.userRepository.save(user)
  }

  async findById(id: number): Promise<User | null> {
    const user = await this.userRepository.findOne({
      where: { id },
    })

    return user || null
  }

  async getDepositHistory(userId: number): Promise<UserDepositHistoryItem[]> {
    await this.findAdminById(userId)

    const deposits = await this.userDepositRepository.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
      take: 100,
    })

    return deposits.map(deposit => ({
      id: deposit.id,
      user_id: deposit.user_id,
      method: deposit.source ?? 'manual',
      amount: deposit.amount,
      bonus_amount: deposit.bonus_amount ?? 0,
      status: deposit.status,
      created_at: deposit.created_at,
      updated_at: deposit.updated_at,
      external_id: deposit.external_id,
      failure_reason: deposit.failure_reason,
    }))
  }

  async getDepositsAdminOverview(): Promise<AdminDepositsOverview> {
    const raw = await this.userDepositRepository
      .createQueryBuilder('deposit')
      .select('COUNT(*)', 'total_count')
      .addSelect(
        `COALESCE(SUM(CASE WHEN deposit.status = 'waiting' THEN 1 ELSE 0 END), 0)`,
        'waiting_count',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN deposit.status = 'success' THEN 1 ELSE 0 END), 0)`,
        'success_count',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN deposit.status = 'error' THEN 1 ELSE 0 END), 0)`,
        'error_count',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN deposit.status = 'cancelled' THEN 1 ELSE 0 END), 0)`,
        'cancelled_count',
      )
      .addSelect('COALESCE(SUM(deposit.amount), 0)', 'total_amount')
      .addSelect(
        `COALESCE(SUM(CASE WHEN deposit.status = 'waiting' THEN deposit.amount ELSE 0 END), 0)`,
        'waiting_amount',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN deposit.status = 'success' THEN deposit.amount ELSE 0 END), 0)`,
        'success_amount',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN deposit.status = 'success' THEN deposit.bonus_amount ELSE 0 END), 0)`,
        'success_bonus_amount',
      )
      .getRawOne<{
        cancelled_count?: number | string | null
        error_count?: number | string | null
        success_amount?: number | string | null
        success_bonus_amount?: number | string | null
        success_count?: number | string | null
        total_amount?: number | string | null
        total_count?: number | string | null
        waiting_amount?: number | string | null
        waiting_count?: number | string | null
      }>()

    return {
      amount: {
        success: this.toNumber(raw?.success_amount),
        total: this.toNumber(raw?.total_amount),
        waiting: this.toNumber(raw?.waiting_amount),
      },
      bonus: {
        success: this.toNumber(raw?.success_bonus_amount),
      },
      cancelled: this.toNumber(raw?.cancelled_count),
      error: this.toNumber(raw?.error_count),
      success: this.toNumber(raw?.success_count),
      total: this.toNumber(raw?.total_count),
      waiting: this.toNumber(raw?.waiting_count),
    }
  }

  async findDepositsForAdmin(
    filters: AdminDepositListQueryDto = {},
  ): Promise<PaginatedResponse<AdminDepositItem>> {
    const pagination = normalizePagination({
      limit: filters.limit,
      page: filters.page,
    })
    const queryBuilder = this.userDepositRepository
      .createQueryBuilder('deposit')
      .leftJoinAndSelect('deposit.user', 'user')
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
      addWhere('deposit.status = :status', { status: filters.status })
    }

    const source = filters.source?.trim()
    if (source) {
      addWhere('deposit.source = :source', { source })
    }

    if (filters.userId !== undefined) {
      addWhere('deposit.user_id = :userId', { userId: filters.userId })
    }

    if (filters.minAmount !== undefined) {
      addWhere('deposit.amount >= :minAmount', {
        minAmount: filters.minAmount,
      })
    }

    if (filters.maxAmount !== undefined) {
      addWhere('deposit.amount <= :maxAmount', {
        maxAmount: filters.maxAmount,
      })
    }

    const search = filters.search?.trim()
    if (search) {
      addWhere(
        `(CAST(deposit.id AS TEXT) ILIKE :search OR CAST(deposit.user_id AS TEXT) ILIKE :search OR COALESCE(deposit.source, '') ILIKE :search OR COALESCE(deposit.external_id, '') ILIKE :search OR COALESCE(deposit.failure_reason, '') ILIKE :search OR COALESCE(user.display_name, '') ILIKE :search)`,
        { search: `%${search}%` },
      )
    }

    const [deposits, total] = await queryBuilder
      .orderBy('deposit.created_at', 'DESC')
      .skip(pagination.skip)
      .take(pagination.limit)
      .getManyAndCount()

    return buildPaginatedResponse(
      deposits.map(deposit => this.toAdminDeposit(deposit)),
      total,
      pagination,
    )
  }

  async findDepositAdminById(id: number): Promise<AdminDepositItem> {
    const deposit = await this.userDepositRepository
      .createQueryBuilder('deposit')
      .leftJoinAndSelect('deposit.user', 'user')
      .where('deposit.id = :id', { id })
      .getOne()

    if (!deposit) {
      throw new NotFoundException('Deposit not found')
    }

    return this.toAdminDeposit(deposit)
  }

  async findBySteamId(steam_id: string | number): Promise<User | null> {
    const steamIdString = steam_id.toString()
    this.logger.log(
      `Searching for user with Steam ID: ${steamIdString} (input type: ${typeof steam_id})`,
    )

    // Use string comparison to avoid precision loss with bigint
    // TypeORM will handle the conversion from string to bigint in the database
    const user = await this.userRepository
      .createQueryBuilder('user')
      .where('CAST(user.steam_id AS TEXT) = :steam_id', {
        steam_id: steamIdString,
      })
      .getOne()

    if (user) {
      this.logger.log(
        `Found user with ID: ${user.id}, Steam ID: ${user.steam_id}`,
      )
    } else {
      this.logger.log(`No user found with Steam ID: ${steamIdString}`)

      // Try alternative search in case of type mismatch
      this.logger.log(`Trying alternative search method...`)
      const altUser = await this.userRepository
        .createQueryBuilder('user')
        .where('user.steam_id = CAST(:steam_id AS BIGINT)', {
          steam_id: steamIdString,
        })
        .getOne()

      if (altUser) {
        this.logger.log(`Found user with alternative search method`)
        return altUser
      }
    }

    return user || null
  }

  async findByTelegramId(telegram_user_id: number): Promise<User | null> {
    const user = await this.userRepository.findOne({
      where: { telegram_user_id },
    })
    return user || null
  }

  async findByGoogleId(google_id: string): Promise<User | null> {
    const user = await this.userRepository.findOne({
      where: { google_id },
    })
    return user || null
  }

  async findByDiscordId(discord_user_id: string): Promise<User | null> {
    const user = await this.userRepository.findOne({
      where: { discord_user_id },
    })
    return user || null
  }

  async create(userData: Partial<User>): Promise<User> {
    if (
      !userData.steam_id &&
      !userData.telegram_user_id &&
      !userData.google_id
    ) {
      throw new Error('Either Steam ID, Telegram ID, or Google ID is required')
    }

    // Handle Steam ID as string to avoid precision loss for large numbers
    const processedData = { ...userData }
    if (processedData.steam_id && typeof processedData.steam_id === 'string') {
      const bigIntValue = BigInt(processedData.steam_id)
      if (bigIntValue <= BigInt(Number.MAX_SAFE_INTEGER)) {
        // Safe to convert to number
        processedData.steam_id = Number(bigIntValue)
      } else {
        // For very large Steam IDs, use raw SQL to preserve precision
        this.logger.log(
          `Creating user with large Steam ID (preserving precision): ${processedData.steam_id}`,
        )
        const steamIdString = processedData.steam_id
        const userDataCopy = { ...processedData }
        delete userDataCopy.steam_id

        // Create user without steam_id first, then update it via raw SQL
        const newUser = this.userRepository.create(userDataCopy)
        const savedUser = await this.userRepository.save(newUser)

        // Update steam_id using raw SQL to preserve precision
        await this.userRepository.manager.query(
          `UPDATE users SET steam_id = CAST($1 AS BIGINT) WHERE id = $2`,
          [steamIdString, savedUser.id],
        )

        // Return updated user
        const updatedUser = await this.userRepository.findOne({
          where: { id: savedUser.id },
        })
        if (!updatedUser) {
          throw new Error('Failed to create user')
        }
        return updatedUser
      }
    }

    const newUser = this.userRepository.create(processedData)
    return this.userRepository.save(newUser)
  }

  async setCountryIfMissing(
    user: Pick<User, 'id' | 'country_code' | 'country_source'>,
    country: UserCountryCandidate | null,
  ): Promise<void> {
    if (!country || !shouldSetUserCountry(user, country)) return

    await this.userRepository
      .createQueryBuilder()
      .update(User)
      .set({
        country_code: country.countryCode,
        country_detected_at: () => 'CURRENT_TIMESTAMP',
        country_source: country.source,
      })
      .where('id = :id', { id: user.id })
      .andWhere("(country_code IS NULL OR country_code = '')")
      .execute()
  }

  async updateTradeLink(userId: number, tradeLink: string): Promise<void> {
    // .save() (instead of .update()) so JwtUserCacheSubscriber gets
    // event.entity.id and can invalidate the JWT user-row cache. See
    // class-level comment on the subscriber for the full reasoning.
    await this.userRepository.save({ id: userId, trade_link: tradeLink })
  }


  /**
   * Updates only Steam ID without changing other user data
   */
  async updateSteamIdOnly(
    userId: number,
    steamId: string | number,
  ): Promise<User> {
    const steamIdString = steamId.toString()
    this.logger.log(
      `Updating Steam ID ${steamIdString} for user ${userId} (without changing other data)`,
    )

    // Handle large Steam IDs (preserve precision)
    const bigIntValue = BigInt(steamIdString)

    if (bigIntValue <= BigInt(Number.MAX_SAFE_INTEGER)) {
      // .save() so JwtUserCacheSubscriber sees the user id.
      await this.userRepository.save({
        id: userId,
        steam_id: Number(bigIntValue),
      })
    } else {
      // For very large Steam IDs, use raw SQL to preserve precision -
      // TypeORM's bigint marshalling rounds at MAX_SAFE_INTEGER.
      await this.userRepository.manager.query(
        `UPDATE users SET steam_id = CAST($1 AS BIGINT) WHERE id = $2`,
        [steamIdString, userId],
      )
      // Raw SQL bypasses TypeORM subscribers - manual invalidate so
      // JwtStrategy doesn't keep serving the pre-link Steam ID.
      await this.invalidateJwtUserCache(userId)
    }

    const updatedUser = await this.findById(userId)
    if (!updatedUser) {
      throw new NotFoundException('User not found')
    }

    return updatedUser
  }

  async updateTelegramIdOnly(
    userId: number,
    telegramUserId: number,
  ): Promise<User> {
    this.logger.log(
      `Linking Telegram ID ${telegramUserId} to user ${userId}`,
    )

    const existing = await this.findByTelegramId(telegramUserId)
    if (existing && existing.id !== userId) {
      throw new BadRequestException(
        'This Telegram account is already linked to another user',
      )
    }

    try {
      await this.userRepository.save({
        id: userId,
        telegram_user_id: telegramUserId,
      })
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        (err as { code?: string }).code === '23505'
      ) {
        throw new BadRequestException(
          'This Telegram account is already linked to another user',
        )
      }

      throw err
    }

    const updatedUser = await this.findById(userId)
    if (!updatedUser) {
      throw new NotFoundException('User not found')
    }

    return updatedUser
  }

  async updateDiscordAccount(
    userId: number,
    discordUser: DiscordUserProfile,
  ): Promise<User> {
    this.logger.log(`Linking Discord ID ${discordUser.id} to user ${userId}`)

    const existing = await this.findByDiscordId(discordUser.id)
    if (existing && existing.id !== userId) {
      throw new BadRequestException(
        'This Discord account is already linked to another user',
      )
    }

    const username =
      discordUser.global_name?.trim() || discordUser.username.trim()

    try {
      await this.userRepository.save({
        id: userId,
        discord_user_id: discordUser.id,
        discord_username: username,
      })
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        (err as { code?: string }).code === '23505'
      ) {
        throw new BadRequestException(
          'This Discord account is already linked to another user',
        )
      }

      throw err
    }

    const updatedUser = await this.findById(userId)
    if (!updatedUser) {
      throw new NotFoundException('User not found')
    }

    return updatedUser
  }


  async linkSteamAccount(
    userId: number,
    steamId: string | number,
    displayName?: string,
    avatar?: string,
    profileUrl?: string,
  ): Promise<User> {
    const steamIdString = steamId.toString()
    this.logger.log(`Linking Steam account ${steamIdString} to user ${userId}`)

    // Check if steam account is already linked to another user using string comparison
    const existingUser = await this.findBySteamId(steamIdString)

    if (existingUser && existingUser.id !== userId) {
      throw new BadRequestException(
        'This Steam account is already linked to another user',
      )
    }

    // Handle large Steam IDs (preserve precision)
    const bigIntValue = BigInt(steamIdString)
    let steamIdNumber: number | string

    if (bigIntValue <= BigInt(Number.MAX_SAFE_INTEGER)) {
      steamIdNumber = Number(bigIntValue)
    } else {
      // For very large Steam IDs, use raw SQL to preserve precision
      this.logger.log(
        `Linking large Steam ID (preserving precision): ${steamIdString}`,
      )

      // First update other fields if provided
      const updateData: Partial<User> = {}
      if (displayName) {
        updateData.display_name = displayName
      }
      if (avatar) {
        updateData.avatar = avatar
      }
      if (profileUrl) {
        updateData.profile_url = profileUrl
      }

      if (Object.keys(updateData).length > 0) {
        // .save() so JwtUserCacheSubscriber sees the user id.
        await this.userRepository.save({ id: userId, ...updateData })
      }

      // Update steam_id using raw SQL to preserve precision -
      // TypeORM's bigint marshalling rounds at MAX_SAFE_INTEGER.
      await this.userRepository.manager.query(
        `UPDATE users SET steam_id = CAST($1 AS BIGINT) WHERE id = $2`,
        [steamIdString, userId],
      )

      const updatedUser = await this.findById(userId)
      if (!updatedUser) {
        throw new NotFoundException('User not found')
      }

      // Raw SQL bypasses TypeORM subscribers - manual invalidate so
      // the JwtStrategy user-cache reflects the new Steam ID
      // immediately. The .save() call above is already covered by
      // the subscriber.
      await this.invalidateJwtUserCache(userId)
      return updatedUser
    }

    // Update user's steam_id and related fields
    const updateData: Partial<User> = {
      steam_id: steamIdNumber,
    }

    if (displayName) {
      updateData.display_name = displayName
    }
    if (avatar) {
      updateData.avatar = avatar
    }
    if (profileUrl) {
      updateData.profile_url = profileUrl
    }

    // .save() so JwtUserCacheSubscriber sees the user id.
    await this.userRepository.save({ id: userId, ...updateData })

    const updatedUser = await this.findById(userId)
    if (!updatedUser) {
      throw new NotFoundException('User not found')
    }

    return updatedUser
  }

  async updateBalance(userId: number, amount: number): Promise<void> {
    // .save() so JwtUserCacheSubscriber sees the user id.
    await this.userRepository.save({ id: userId, balance: amount })
  }

  async incrementOpenedCases(userId: number): Promise<void> {
    // .increment() runs an atomic UPDATE ... SET col = col + 1 - much
    // cheaper than a load-then-save round-trip on a hot path called
    // every time a player opens a case. Trade-off: same broken event
    // shape as repository.update() (no entity.id on the subscriber),
    // so we manually invalidate. This is the only non-raw-SQL caller
    // that needs the manual fallback.
    await this.userRepository.increment({ id: userId }, 'opened_cases', 1)
    await this.invalidateJwtUserCache(userId)
  }

  async updateSteamDisplayName(userId: number): Promise<User> {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
      })

      if (!user) {
        throw new NotFoundException('User not found')
      }

      if (!user.steam_id) {
        throw new BadRequestException('Steam ID not found')
      }

      const steamProfile = await this.getSteamProfile(user.steam_id.toString())

      if (!steamProfile.personaname) {
        throw new NotFoundException('Steam display name not found')
      }

      user.display_name = steamProfile.personaname
      await this.userRepository.save(user)

      return user
    } catch (error: unknown) {
      this.logger.error(
        `Error updating Steam display name for user ${userId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
      throw error
    }
  }

  async updateSteamAvatar(userId: number): Promise<User> {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
      })

      if (!user) {
        throw new NotFoundException('User not found')
      }

      if (!user.steam_id) {
        throw new BadRequestException('Steam ID not found')
      }

      const steamProfile = await this.getSteamProfile(user.steam_id.toString())

      const avatar =
        steamProfile.avatarfull || steamProfile.avatarmedium || steamProfile.avatar
      if (!avatar) {
        throw new NotFoundException('Steam avatar not found')
      }

      user.avatar = avatar
      await this.userRepository.save(user)

      return user
    } catch (error: unknown) {
      this.logger.error(
        `Error updating Steam avatar for user ${userId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
      throw error
    }
  }

  async getSteamProfileBonusStatus(
    userId: number,
  ): Promise<SteamProfileBonusStatus> {
    const user = await this.userRepository.findOne({ where: { id: userId } })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    if (!user.steam_id) {
      return {
        avatar: this.buildSteamBonusStatus(user, 'avatar', false),
        nickname: this.buildSteamBonusStatus(user, 'nickname', false),
      }
    }

    const shouldRecheck =
      this.shouldRecheckSteamBonus(user, 'avatar') ||
      this.shouldRecheckSteamBonus(user, 'nickname')

    if (shouldRecheck) {
      const steamProfile = await this.getSteamProfile(user.steam_id.toString())
      this.applySteamProfileToUser(user, steamProfile)
      this.refreshSteamBonusActivity(user, 'avatar', steamProfile)
      this.refreshSteamBonusActivity(user, 'nickname', steamProfile)
      await this.userRepository.save(user)
    }

    return {
      avatar: this.buildSteamBonusStatus(user, 'avatar', true),
      nickname: this.buildSteamBonusStatus(user, 'nickname', true),
    }
  }

  async claimSteamProfileBonus(
    userId: number,
    type: SteamProfileBonusType,
  ): Promise<{
    user: User
    status: SteamProfileBonusItemStatus
    cooldownReducedSeconds: number
  }> {
    return this.userRepository.manager.transaction(async manager => {
      const user = await manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      })

      if (!user) {
        throw new NotFoundException('User not found')
      }

      if (!user.steam_id) {
        throw new BadRequestException('Steam account is not linked')
      }

      const steamProfile = await this.getSteamProfile(user.steam_id.toString())
      this.applySteamProfileToUser(user, steamProfile)

      const isVerified = this.isSteamProfileBonusVerified(type, steamProfile)
      if (!isVerified) {
        this.setSteamBonusActive(user, type, false)
        this.setSteamBonusLastVerifiedAt(user, type, new Date())
        await manager.save(user)
        throw new BadRequestException('Steam profile bonus condition is not met')
      }

      const wasClaimed = Boolean(this.getSteamBonusClaimedAt(user, type))
      const now = new Date()
      this.setSteamBonusActive(user, type, true)
      this.setSteamBonusLastVerifiedAt(user, type, now)

      let cooldownReducedSeconds = 0

      if (!wasClaimed) {
        this.setSteamBonusClaimedAt(user, type, now)
        cooldownReducedSeconds = await this.reduceBonusWheelCooldown(
          manager,
          user.id,
          STEAM_PROFILE_COOLDOWN_REDUCTION_MS,
        )
      }

      await manager.save(user)

      return {
        user,
        status: this.buildSteamBonusStatus(user, type, true),
        cooldownReducedSeconds,
      }
    })
  }

  private async getSteamProfile(steamId: string): Promise<SteamProfile> {
    const response = await firstValueFrom(
      this.httpService.get(
        `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${process.env.STEAM_API_KEY}&steamids=${steamId}`,
      ),
    )

    if (!response.data.response.players[0]) {
      throw new NotFoundException('Steam profile not found')
    }

    return response.data.response.players[0]
  }

  private applySteamProfileToUser(user: User, profile: SteamProfile): void {
    if (profile.personaname) {
      user.display_name = profile.personaname
    }
    user.avatar = profile.avatarfull || profile.avatarmedium || profile.avatar || user.avatar
  }

  private isSteamProfileBonusVerified(
    type: SteamProfileBonusType,
    profile: SteamProfile,
  ): boolean {
    if (type === 'nickname') {
      return Boolean(
        profile.personaname
          ?.toLocaleLowerCase()
          .includes(BUNNY_NICKNAME_MARKER.toLocaleLowerCase()),
      )
    }

    return this.isBunnySteamAvatar(
      profile.avatarfull || profile.avatarmedium || profile.avatar,
    )
  }

  private refreshSteamBonusActivity(
    user: User,
    type: SteamProfileBonusType,
    profile: SteamProfile,
  ): void {
    if (!this.getSteamBonusClaimedAt(user, type)) return

    const isVerified = this.isSteamProfileBonusVerified(type, profile)
    this.setSteamBonusActive(user, type, isVerified)
    this.setSteamBonusLastVerifiedAt(user, type, new Date())
  }

  private shouldRecheckSteamBonus(
    user: User,
    type: SteamProfileBonusType,
  ): boolean {
    if (!this.getSteamBonusClaimedAt(user, type)) return false
    if (!this.getSteamBonusActive(user, type)) return false

    const lastVerifiedAt = this.getSteamBonusLastVerifiedAt(user, type)
    if (!lastVerifiedAt) return true

    return Date.now() - lastVerifiedAt.getTime() >= STEAM_PROFILE_BONUS_RECHECK_MS
  }

  private buildSteamBonusStatus(
    user: User,
    type: SteamProfileBonusType,
    isLinked: boolean,
  ): SteamProfileBonusItemStatus {
    const isClaimed = Boolean(this.getSteamBonusClaimedAt(user, type))
    const isActive = this.getSteamBonusActive(user, type)
    const lastVerifiedAt = this.getSteamBonusLastVerifiedAt(user, type)
    const status: SteamProfileBonusStatusValue = !isLinked
      ? 'notLinked'
      : isClaimed && isActive
      ? 'verified'
      : isClaimed && !isActive
      ? 'notVerified'
      : 'idle'

    return {
      status,
      isClaimed,
      isActive,
      claimedAt: this.getSteamBonusClaimedAt(user, type),
      lastVerifiedAt,
      nextRecheckAt:
        isClaimed && isActive && lastVerifiedAt
          ? new Date(lastVerifiedAt.getTime() + STEAM_PROFILE_BONUS_RECHECK_MS)
          : null,
    }
  }

  private getSteamBonusClaimedAt(
    user: User,
    type: SteamProfileBonusType,
  ): Date | null {
    return type === 'avatar'
      ? user.steam_avatar_bonus_claimed_at
      : user.steam_nickname_bonus_claimed_at
  }

  private setSteamBonusClaimedAt(
    user: User,
    type: SteamProfileBonusType,
    value: Date,
  ): void {
    if (type === 'avatar') {
      user.steam_avatar_bonus_claimed_at = value
    } else {
      user.steam_nickname_bonus_claimed_at = value
    }
  }

  private getSteamBonusLastVerifiedAt(
    user: User,
    type: SteamProfileBonusType,
  ): Date | null {
    return type === 'avatar'
      ? user.steam_avatar_bonus_last_verified_at
      : user.steam_nickname_bonus_last_verified_at
  }

  private setSteamBonusLastVerifiedAt(
    user: User,
    type: SteamProfileBonusType,
    value: Date,
  ): void {
    if (type === 'avatar') {
      user.steam_avatar_bonus_last_verified_at = value
    } else {
      user.steam_nickname_bonus_last_verified_at = value
    }
  }

  private getSteamBonusActive(user: User, type: SteamProfileBonusType): boolean {
    return type === 'avatar'
      ? Boolean(user.steam_avatar_bonus_active)
      : Boolean(user.steam_nickname_bonus_active)
  }

  private setSteamBonusActive(
    user: User,
    type: SteamProfileBonusType,
    value: boolean,
  ): void {
    if (type === 'avatar') {
      user.steam_avatar_bonus_active = value
    } else {
      user.steam_nickname_bonus_active = value
    }
  }

  private isBunnySteamAvatar(avatarUrl?: string | null): boolean {
    const hash = avatarUrl?.match(
      /([a-f0-9]{40})(?:_(?:full|medium))?\.(?:jpg|jpeg|png|webp)?$/i,
    )?.[1]

    return hash ? BUNNY_STEAM_AVATAR_HASHES.has(hash.toLocaleLowerCase()) : false
  }

  private async reduceBonusWheelCooldown(
    manager: EntityManager,
    userId: number,
    reductionMs: number,
  ): Promise<number> {
    const cooldown = await manager.findOne(RewardsCooldown, {
      where: { user: { id: userId } },
      lock: { mode: 'pessimistic_write' },
    })

    if (!cooldown) return 0

    const now = new Date()
    if (cooldown.next_available <= now) return 0

    const previous = cooldown.next_available.getTime()
    const next = Math.max(now.getTime(), previous - reductionMs)
    cooldown.next_available = new Date(next)
    await manager.save(cooldown)

    return Math.round((previous - next) / 1000)
  }

  private toAdminDeposit(deposit: UserDeposit): AdminDepositItem {
    return {
      amount: deposit.amount,
      bonus_amount: deposit.bonus_amount ?? 0,
      created_at: deposit.created_at,
      external_id: deposit.external_id,
      failure_reason: deposit.failure_reason,
      id: deposit.id,
      method: deposit.source ?? 'manual',
      status: deposit.status,
      updated_at: deposit.updated_at,
      user:
        deposit.user != null
          ? {
              avatar: deposit.user.avatar ?? null,
              display_name: deposit.user.display_name,
              id: deposit.user.id,
            }
          : null,
      user_id: deposit.user_id,
    }
  }

  private toNumber(value: string | number | null | undefined): number {
    const parsed = Number(value)

    return Number.isFinite(parsed) ? parsed : 0
  }

  async validateAndDeductBalance(
    userId: number,
    amount: number,
    options: BalanceDeductionOptions = {},
  ): Promise<void> {
    await this.userRepository.manager.transaction(async manager => {
      const user = await manager.findOne(User, { where: { id: userId } })
      if (!user) {
        throw new NotFoundException('User not found')
      }
      if (user.balance < amount) {
        throw new BadRequestException('Insufficient balance')
      }
      user.balance -= amount
      if (options.vipEarning) {
        await this.vipService.recordEarning(manager, user, options.vipEarning)
      }
      await manager.save(user)
    })
  }

  /**
   * Claim Telegram subscription bonus
   * @param userId - User ID
   * @param bonusAmount - Bonus amount to add
   * @returns Updated user with new balance
   */
  async claimTelegramSubscriptionBonus(
    userId: number,
    bonusAmount: number,
  ): Promise<User> {
    return this.userRepository.manager.transaction(async manager => {
      const user = await manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      })

      if (!user) {
        throw new NotFoundException('User not found')
      }

      if (user.telegram_bonus_claimed) {
        throw new BadRequestException(
          'Telegram subscription bonus has already been claimed',
        )
      }

      user.balance = Math.round((Number(user.balance) + bonusAmount) * 100) / 100
      user.telegram_bonus_claimed = true
      await manager.save(user)

      this.logger.log(
        `Telegram subscription bonus claimed for user ${userId}: ${bonusAmount}`,
      )

      return user
    })
  }

  async claimDiscordSubscriptionBonus(
    userId: number,
    bonusAmount: number,
  ): Promise<User> {
    return this.userRepository.manager.transaction(async manager => {
      const user = await manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      })

      if (!user) {
        throw new NotFoundException('User not found')
      }

      if (user.discord_bonus_claimed) {
        throw new BadRequestException(
          'Discord subscription bonus has already been claimed',
        )
      }

      user.balance = Math.round((Number(user.balance) + bonusAmount) * 100) / 100
      user.discord_bonus_claimed = true
      await manager.save(user)

      this.logger.log(
        `Discord subscription bonus claimed for user ${userId}: ${bonusAmount}`,
      )

      return user
    })
  }
}

export type SteamProfileBonusType = 'avatar' | 'nickname'

export type SteamProfileBonusStatusValue =
  | 'idle'
  | 'verified'
  | 'notVerified'
  | 'notLinked'

export interface SteamProfileBonusItemStatus {
  status: SteamProfileBonusStatusValue
  isClaimed: boolean
  isActive: boolean
  claimedAt: Date | null
  lastVerifiedAt: Date | null
  nextRecheckAt: Date | null
}

export interface SteamProfileBonusStatus {
  avatar: SteamProfileBonusItemStatus
  nickname: SteamProfileBonusItemStatus
}

interface SteamProfile {
  personaname?: string
  avatar?: string
  avatarmedium?: string
  avatarfull?: string
}

const STEAM_PROFILE_BONUS_RECHECK_MS = 24 * 60 * 60 * 1000
const STEAM_PROFILE_COOLDOWN_REDUCTION_MS = 6 * 60 * 60 * 1000
const BUNNY_NICKNAME_MARKER = 'WBUNNY'
const BUNNY_STEAM_AVATAR_HASHES = new Set([
  '944ed3e7eaf8c66cdab6afd13c6970f7daab5c54',
  '690865b76faee706fc1fc9fbd699be9d7f42cd94',
  '9b8493987c0c713d023397db9152ac6bc1d4c9d1',
  'ec0a4b82ae35994ddced0d94d50e476058e2c9b2',
])
