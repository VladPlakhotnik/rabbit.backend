import * as crypto from 'crypto'
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ClickerCase } from './entities/clicker_case.entity'
import { ClickerSkinCase } from './entities/clicker_skin_case.entity'
import { UpdateClickerCaseDto, CreateClickerCaseDto } from './dto'
import { ClickerUserService } from '../clickerUser/clicker-user.service'
import { ProvablyFairService } from '../provably-fair/provably-fair.service'
import { GameType } from '../provably-fair/enums/game-type.enum'
import { UserInventoryService } from '../userInventory/userInventory.service'
import { UserInventory } from '../userInventory/userInventory.entity'
import { UserHistoryService } from '../userHistory/userHistory.service'
import { LiveDropsService } from '../liveDrops/liveDrops.service'
import type { LiveDropPayload } from '../liveDrops/types'
import { UserService } from '../users/users.service'
import { User } from '../users/user.entity'

interface TicketRange {
  skinCase: ClickerSkinCase
  start: number
  end: number
}

export interface ClickerCaseFilters {
  search?: string
  gameType?: 'csgo' | 'dota'
  /** When true and `balance` is finite, only cases priced ≤ `balance`. */
  enoughBalance?: boolean
  balance?: number
}

// `chance` is `numeric(5, 2)` — multiplying by 1 000 makes a 100% case yield
// 100 000 integer tickets, identical to the regular CaseService contract.
const TICKETS_PER_PERCENT = 1_000

const ticketsFor = (chance: number): number =>
  Math.floor(chance * TICKETS_PER_PERCENT)

// Stable order: market_price DESC, then ClickerSkinCase.id ASC as the
// tiebreaker. Same contract the regular CaseService uses so the chances
// modal and the roll path always agree on skin order.
const sortSkinCasesForLottery = (skinCases: ClickerSkinCase[]): void => {
  skinCases.sort((a, b) => {
    const priceA = a.skin?.market_price ?? 0
    const priceB = b.skin?.market_price ?? 0
    if (priceA !== priceB) return priceB - priceA
    return a.id - b.id
  })
}

// Mirrors the timings used by CaseService — a clicker drop should reveal in
// the LiveDrop feed at the same wall-clock moment the spin animation
// completes on the user's screen, so single source of truth for ordering
// holds across browsers.
const LIVEDROP_REVEAL_DELAY_MS = 7_900
const LIVEDROP_REVEAL_STAGGER_MS = 180

export interface ClickerOpenResult {
  results: Array<{
    winner: ClickerSkinCase
    inventory: UserInventory
    game_id: number
  }>
  totalCost: number
  newBalance: number
}

@Injectable()
export class ClickerCasesService {
  private readonly logger = new Logger(ClickerCasesService.name)

  constructor(
    @InjectRepository(ClickerCase)
    private readonly caseRepository: Repository<ClickerCase>,
    @InjectRepository(ClickerSkinCase)
    private readonly skinCaseRepository: Repository<ClickerSkinCase>,
    private readonly clickerUserService: ClickerUserService,
    private readonly provablyFairService: ProvablyFairService,
    private readonly userInventoryService: UserInventoryService,
    private readonly userHistoryService: UserHistoryService,
    private readonly liveDropsService: LiveDropsService,
    private readonly userService: UserService,
  ) {}

  /**
   * List clicker cases with optional server-side filtering.
   *
   * - `search` — case-insensitive substring match on `name`.
   * - `gameType` — `csgo` / `dota`. Currently every case is 'csgo', so
   *   `dota` returns an empty list — keeps the shop's CS / Dota tab
   *   contract uniform with the regular cases endpoint.
   * - `balance` + `enoughBalance` — together they implement the "Available
   *   for me" filter. We don't read the user's balance off the JWT here
   *   (the list endpoint is anonymous) — the client passes its own
   *   balance via query, the server just thresholds on `case_price`.
   *   Worst case the user crafts a fake balance and sees a case they
   *   can't afford; openCase still gates with the real Redis-backed
   *   balance, so this is a UI hint only.
   */
  findAllCases(filters?: ClickerCaseFilters) {
    const qb = this.caseRepository
      .createQueryBuilder('cc')
      .leftJoinAndSelect('cc.skinCases', 'sc')
      .leftJoinAndSelect('sc.skin', 'skin')
      .orderBy('cc.id', 'ASC')
      .addOrderBy('skin.market_price', 'DESC')

    const search = filters?.search?.trim()
    if (search) {
      qb.andWhere('cc.name ILIKE :search', { search: `%${search}%` })
    }

    if (filters?.gameType === 'csgo' || filters?.gameType === 'dota') {
      qb.andWhere('cc.game_type = :game', { game: filters.gameType })
    }

    if (
      filters?.enoughBalance &&
      typeof filters.balance === 'number' &&
      Number.isFinite(filters.balance)
    ) {
      qb.andWhere('cc.case_price <= :balance', { balance: filters.balance })
    }

    return qb.getMany()
  }

  async findCaseById(id: number) {
    const caseEntity = await this.caseRepository.findOne({
      where: { id },
      relations: ['skinCases', 'skinCases.skin'],
      order: {
        skinCases: {
          skin: { market_price: 'DESC' },
        },
      },
    })
    if (caseEntity?.skinCases) {
      this.assignTicketRanges(caseEntity.skinCases)
    }
    return caseEntity
  }

  async findCaseBySlug(slug: string): Promise<ClickerCase> {
    const caseEntity = await this.caseRepository.findOne({
      where: { slug },
      relations: ['skinCases', 'skinCases.skin'],
      order: {
        skinCases: {
          skin: { market_price: 'DESC' },
        },
      },
    })
    if (!caseEntity) {
      throw new NotFoundException('Clicker case not found')
    }
    if (caseEntity.skinCases) {
      this.assignTicketRanges(caseEntity.skinCases)
    }
    return caseEntity
  }

  async createCase(dto: CreateClickerCaseDto) {
    const clickerCase = this.caseRepository.create(dto)
    return this.caseRepository.save(clickerCase)
  }

  async updateCase(id: number, dto: UpdateClickerCaseDto) {
    await this.caseRepository.update(id, dto)
    return this.caseRepository.findOne({ where: { id } })
  }

  async removeCase(id: number) {
    return this.caseRepository.delete(id)
  }

  /**
   * Open one or more clicker cases.
   *
   * Flow:
   *   1. Validate slug, count (1-5), limited supply.
   *   2. Atomically debit `case_price * count` carrots (Lua + force-flush
   *      to Postgres so the user sees the new balance immediately).
   *   3. Roll one provably-fair drop per case; persist inventory rows.
   *   4. Decrement `remaining_count` if limited.
   *   5. Snapshot the event into `case_history` so the user's history
   *      shows it the same way regular case opens do.
   *   6. Publish each drop to the LiveDrop feed (delayed to match the
   *      spin animation, same as regular cases).
   *
   * Errors during steps 5-6 don't refund — case opens are consumable;
   * the inventory rows that did make it survive on partial failure.
   */
  async openCase(
    slug: string,
    userId: number,
    count: number = 1,
  ): Promise<ClickerOpenResult> {
    if (!Number.isFinite(count) || count < 1 || count > 5) {
      throw new BadRequestException('Count must be between 1 and 5')
    }

    const caseEntity = await this.caseRepository.findOne({ where: { slug } })
    if (!caseEntity) {
      throw new NotFoundException('Clicker case not found')
    }

    // Hard guard: even if the UI is hiding the open button behind a "locked"
    // overlay, a hand-crafted POST should not get past this.
    if (!caseEntity.is_available) {
      throw new BadRequestException('This case is currently locked')
    }

    if (caseEntity.is_limited && caseEntity.remaining_count < count) {
      throw new BadRequestException(
        'Not enough copies of this case remaining',
      )
    }

    const skinCases = await this.getAvailableSkins(caseEntity)
    const totalCost = caseEntity.case_price * count

    const newBalance = await this.clickerUserService.deductPoints(
      userId,
      totalCost,
    )

    // Single user lookup reused for all LiveDrop publishes in this call.
    // Fetched eagerly so the feed publish at the end of the loop doesn't
    // add latency to the openCase response.
    const userPromise = this.loadUserForLiveDrop(userId)

    const results: ClickerOpenResult['results'] = []
    const historyDrops: Array<{
      skin_id?: number
      skin_name?: string
      skin_img?: string
      skin_price?: number
      game_type?: 'csgo' | 'dota'
      server_seed?: string
    }> = []

    for (let i = 0; i < count; i++) {
      const clientSeed = crypto.randomBytes(32).toString('hex')
      const provablyFair = await this.provablyFairService.generateSeed(
        userId,
        clientSeed,
        GameType.CLICKER_CASE,
      )
      const randomNumber = this.provablyFairService.generateRandomNumber(
        clientSeed,
        provablyFair.server_seed,
      )

      const ticketRanges = this.prepareTicketRanges(skinCases)
      const winner = this.selectWinner(ticketRanges, randomNumber)

      const inventory =
        await this.userInventoryService.createInventoryFromClickerCase(
          userId,
          winner.skin,
          caseEntity,
        )

      await this.provablyFairService.markSeedAsUsed(provablyFair.id)

      historyDrops.push({
        skin_id: winner.skin?.id,
        skin_name: winner.skin?.market_hash_name,
        skin_img: winner.skin?.image,
        skin_price: winner.skin?.market_price,
        game_type: 'csgo',
        server_seed: provablyFair.server_seed,
      })

      results.push({
        winner,
        inventory,
        game_id: provablyFair.id,
      })
    }

    if (caseEntity.is_limited) {
      // Atomic decrement so two parallel opens can't cross zero.
      await this.caseRepository.decrement(
        { id: caseEntity.id },
        'remaining_count',
        count,
      )
    }

    // History — one row per event, mirroring CaseService's open-case
    // contract. case_history.case_id has no DB-level FK to `cases`, so
    // writing the clicker_case.id there is safe; readers that care about
    // the source can also look at user_inventory.clicker_case_id.
    try {
      await this.userHistoryService.openCase(
        userId,
        caseEntity.id,
        caseEntity.name,
        caseEntity.case_price,
        caseEntity.image_url,
        historyDrops,
        'csgo',
      )
    } catch (err) {
      this.logger.warn(
        `clicker case history write failed: ${
          err instanceof Error ? err.message : err
        }`,
      )
    }

    // LiveDrop publish — staggered to match the spin animation. Same
    // pattern CaseService uses; pushDrop swallows its own Redis errors so
    // a feed hiccup never affects the open-case response.
    const user = await userPromise
    results.forEach((result, i) => {
      const delay =
        LIVEDROP_REVEAL_DELAY_MS + i * LIVEDROP_REVEAL_STAGGER_MS
      setTimeout(() => {
        void this.publishLiveDrop(result.winner, caseEntity, userId, user)
      }, delay)
    })

    return { results, totalCost, newBalance }
  }

  private async loadUserForLiveDrop(userId: number): Promise<User | null> {
    try {
      return await this.userService.findById(userId)
    } catch {
      return null
    }
  }

  private async publishLiveDrop(
    winner: ClickerSkinCase,
    caseEntity: ClickerCase,
    userId: number,
    user: User | null,
  ): Promise<void> {
    const username = user?.display_name || `Player${userId}`
    const avatar = user?.avatar || null

    const payload: LiveDropPayload = {
      id: crypto.randomUUID(),
      user: { id: userId, username, avatar },
      skin: {
        id: winner.skin.id,
        name: winner.skin.name ?? winner.skin.market_hash_name,
        market_hash_name: winner.skin.market_hash_name,
        image: winner.skin.image,
        market_price: winner.skin.market_price,
        quality: winner.skin.quality ?? '',
        name_color: winner.skin.name_color ?? '',
        background_color: winner.skin.background_color ?? '',
      },
      case: {
        id: caseEntity.id,
        slug: caseEntity.slug,
        name: caseEntity.name,
        img_url: caseEntity.image_url,
      },
      isBot: false,
      ts: Date.now(),
    }

    await this.liveDropsService.pushDrop(payload)
  }

  private async getAvailableSkins(
    caseEntity: ClickerCase,
  ): Promise<ClickerSkinCase[]> {
    const skinCases = await this.skinCaseRepository.find({
      where: { case: { id: caseEntity.id }, is_drop_out: true },
      relations: ['skin'],
    })

    const valid = skinCases.filter(sc => sc.skin != null)
    if (valid.length === 0) {
      throw new InternalServerErrorException(
        'Clicker case has no skins configured',
      )
    }
    sortSkinCasesForLottery(valid)
    return valid
  }

  private prepareTicketRanges(
    skinCases: ClickerSkinCase[],
  ): TicketRange[] {
    let ticketStart = 1
    return skinCases.map(skinCase => {
      const chance = Number(skinCase.chance)
      if (!Number.isFinite(chance) || chance <= 0) {
        throw new BadRequestException('Invalid skin chance')
      }
      const tickets = ticketsFor(chance)
      const range: TicketRange = {
        skinCase,
        start: ticketStart,
        end: ticketStart + tickets - 1,
      }
      ticketStart += tickets
      return range
    })
  }

  // Annotate each ClickerSkinCase with its `ticket_range` so the chances
  // modal on the frontend can show the same numbers the openCase roll
  // uses. is_drop_out=false rows don't participate in the lottery.
  private assignTicketRanges(skinCases: ClickerSkinCase[]): void {
    sortSkinCasesForLottery(skinCases)
    let ticketStart = 1
    for (const sc of skinCases) {
      const chance = Number(sc.chance)
      if (!sc.is_drop_out || !Number.isFinite(chance) || chance <= 0) {
        sc.ticket_range = null
        continue
      }
      const tickets = ticketsFor(chance)
      sc.ticket_range = {
        start: ticketStart,
        end: ticketStart + tickets - 1,
      }
      ticketStart += tickets
    }
  }

  private selectWinner(
    ticketRanges: TicketRange[],
    randomNumber: number,
  ): ClickerSkinCase {
    const lastRange = ticketRanges[ticketRanges.length - 1]
    if (!lastRange) {
      throw new InternalServerErrorException('Empty ticket pool')
    }
    const totalTickets = lastRange.end
    const randomTicket = Math.floor(randomNumber * totalTickets) + 1

    const winnerRange = ticketRanges.find(
      range => randomTicket >= range.start && randomTicket <= range.end,
    )
    if (!winnerRange) {
      throw new InternalServerErrorException(
        'Error selecting winner: no winner found',
      )
    }
    return winnerRange.skinCase
  }
}
