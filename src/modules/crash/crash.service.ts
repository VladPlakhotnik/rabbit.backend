import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectEntityManager } from '@nestjs/typeorm'
import { createHash, randomBytes } from 'node:crypto'
import { EntityManager } from 'typeorm'
import { UserInventory } from '../userInventory/userInventory.entity'
import { UPGRADE_LIMITS } from '../upgrade/upgrade.constants'
import { User } from '../users/user.entity'
import {
  CashoutCrashSessionDto,
  SettleCrashSessionDto,
  StartCrashGameDto,
} from './dto'
import {
  CrashSession,
  CrashSessionStatus,
  CrashStakeItemSnapshot,
  CrashStakeMode,
} from './entities/crash-session.entity'
import {
  calculateCrashPayout,
  roundCrashMoney,
  splitCrashStake,
} from './crash-game.logic'

export interface PublicCrashSession {
  game_session_id: number
  status: CrashSessionStatus
  stake_mode: CrashStakeMode
  slot: number
  bet_amount: number
  cashout_multiplier: number | null
  win_amount: number | null
  stake_items: CrashStakeItemSnapshot[]
  created_at: Date
  updated_at: Date
}

export interface StartCrashGameResult {
  sessions: PublicCrashSession[]
  new_balance: number
}

export interface CashoutCrashSessionResult {
  success: boolean
  final_multiplier: number
  win_amount: number
  new_balance: number
  message: string
  session: PublicCrashSession
}

export interface SettleCrashSessionResult {
  success: boolean
  session: PublicCrashSession
}

@Injectable()
export class CrashService {
  constructor(
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
  ) {}

  async startGame(
    userId: number,
    startGameDto: StartCrashGameDto,
  ): Promise<StartCrashGameResult> {
    return this.entityManager.transaction(async manager => {
      const user = await this.lockUser(manager, userId)
      const betCount = this.resolveBetCount(startGameDto.bet_count)
      const mode = this.resolveStakeMode(startGameDto)
      let stakeAmounts: number[]
      let stakeItems: CrashStakeItemSnapshot[] | null = null

      if (mode === 'balance') {
        const stake = this.assertStakeAmount(Number(startGameDto.bet_amount))
        stakeAmounts = Array.from({ length: betCount }, () => stake)
        const totalStake = roundCrashMoney(
          stakeAmounts.reduce((sum, amount) => sum + amount, 0),
        )

        if (Number(user.balance) < totalStake) {
          throw new BadRequestException('Insufficient balance for crash game')
        }

        user.balance = roundCrashMoney(Number(user.balance) - totalStake)
        await manager.save(user)
      } else {
        const inventoryItems = await this.lockInventoryStake(
          manager,
          userId,
          this.normalizeInventoryIds(startGameDto),
        )
        stakeItems = this.buildStakeItems(inventoryItems)
        const totalInventoryStake = roundCrashMoney(
          stakeItems.reduce((sum, item) => sum + item.price, 0),
        )
        stakeAmounts = splitCrashStake(totalInventoryStake, betCount).map(amount =>
          this.assertStakeAmount(amount),
        )

        inventoryItems.forEach(item => {
          item.is_sold = true
        })
        await manager.save(UserInventory, inventoryItems)
      }

      const sessions = stakeAmounts.map((stakeAmount, index) =>
        manager.create(CrashSession, {
          user_id: userId,
          stake_mode: mode,
          slot: index + 1,
          stake_amount: stakeAmount,
          status: 'active',
          cashout_multiplier: null,
          win_amount: null,
          mfr_seed_hash: this.createMfrSeedHash(),
          stake_items: stakeItems,
        }),
      )

      const savedSessions = await manager.save(CrashSession, sessions)

      return {
        sessions: savedSessions.map(session => this.toPublicSession(session)),
        new_balance: Number(user.balance),
      }
    })
  }

  async cashout(
    userId: number,
    cashoutDto: CashoutCrashSessionDto,
  ): Promise<CashoutCrashSessionResult> {
    return this.entityManager.transaction(async manager => {
      const session = await this.lockSession(
        manager,
        userId,
        cashoutDto.game_session_id,
      )
      const user = await this.lockUser(manager, userId)

      if (session.status === 'cashed_out') {
        return {
          success: true,
          final_multiplier: Number(session.cashout_multiplier) || 1,
          win_amount: Number(session.win_amount) || 0,
          new_balance: Number(user.balance),
          message: 'Crash cashout already processed.',
          session: this.toPublicSession(session),
        }
      }

      if (session.status !== 'active') {
        throw new BadRequestException('Crash session is not active')
      }

      const finalMultiplier = roundCrashMoney(cashoutDto.multiplier)
      const winAmount = calculateCrashPayout(
        Number(session.stake_amount),
        finalMultiplier,
      )

      user.balance = roundCrashMoney(Number(user.balance) + winAmount)
      session.status = 'cashed_out'
      session.cashout_multiplier = finalMultiplier
      session.win_amount = winAmount

      await manager.save(user)
      await manager.save(session)

      return {
        success: true,
        final_multiplier: finalMultiplier,
        win_amount: winAmount,
        new_balance: Number(user.balance),
        message: 'Crash cashout successful.',
        session: this.toPublicSession(session),
      }
    })
  }

  async settle(
    userId: number,
    settleDto: SettleCrashSessionDto,
  ): Promise<SettleCrashSessionResult> {
    return this.entityManager.transaction(async manager => {
      const session = await this.lockSession(
        manager,
        userId,
        settleDto.game_session_id,
      )

      if (session.status === 'active') {
        session.status = 'crashed'
        session.cashout_multiplier = 0
        session.win_amount = 0
        await manager.save(session)
      }

      return {
        success: true,
        session: this.toPublicSession(session),
      }
    })
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

  private async lockSession(
    manager: EntityManager,
    userId: number,
    sessionId: number,
  ): Promise<CrashSession> {
    const session = await manager.findOne(CrashSession, {
      where: { id: sessionId, user_id: userId },
      lock: { mode: 'pessimistic_write' },
    })

    if (!session) {
      throw new NotFoundException('Crash session not found')
    }

    return session
  }

  private resolveStakeMode(dto: StartCrashGameDto): CrashStakeMode {
    const hasBalanceStake = dto.bet_amount !== undefined
    const hasInventoryStake =
      dto.inventory_skin_ids !== undefined && dto.inventory_skin_ids.length > 0

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

  private resolveBetCount(betCount: 1 | 2 | undefined): 1 | 2 {
    return betCount === 2 ? 2 : 1
  }

  private normalizeInventoryIds(dto: StartCrashGameDto): number[] {
    const normalized = dto.inventory_skin_ids ?? []
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
  ): CrashStakeItemSnapshot[] {
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
        price: roundCrashMoney(price),
      }
    })
  }

  private assertStakeAmount(amount: number): number {
    if (!Number.isFinite(amount)) {
      throw new BadRequestException('Invalid crash stake amount')
    }

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

    return roundCrashMoney(amount)
  }

  private createMfrSeedHash(): string {
    return createHash('sha256').update(randomBytes(32)).digest('hex')
  }

  private toPublicSession(session: CrashSession): PublicCrashSession {
    return {
      game_session_id: session.id,
      status: session.status,
      stake_mode: session.stake_mode,
      slot: session.slot,
      bet_amount: Number(session.stake_amount),
      cashout_multiplier:
        session.cashout_multiplier === null
          ? null
          : Number(session.cashout_multiplier),
      win_amount:
        session.win_amount === null ? null : roundCrashMoney(Number(session.win_amount)),
      stake_items: session.stake_items ?? [],
      created_at: session.created_at,
      updated_at: session.updated_at,
    }
  }
}
