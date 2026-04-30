import * as crypto from 'crypto'
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Case } from './case.entity'
import { Repository, In } from 'typeorm'
import { Section } from '../sections/section.entity'
import { SkinCase } from '../skinCase/skinCase.entity'
import { CsgoSkin } from '../skins/csgo-skin.entity'
import { DotaSkin } from '../skins/dota-skin.entity'
import { UserInventory } from '../userInventory/userInventory.entity'
import { ProvablyFairService } from '../provably-fair/provably-fair.service'
import { GameType } from '../provably-fair/enums/game-type.enum'
import { UserService } from '../users/users.service'
import { UserInventoryService } from '../userInventory/userInventory.service'
import { UserHistoryService } from '../userHistory/userHistory.service'
import { HistoryAction } from '../userHistory/enums/history-action.enum'
import { LiveDropsService } from '../liveDrops/liveDrops.service'
import type { LiveDropPayload } from '../liveDrops/types'
import { User } from '../users/user.entity'

// Delay between the openCase response and the LiveDrop fan-out. Matches
// the frontend `CASE_OPEN_TOTAL_DURATION_MS` (4.5 spin + 3.0 landing +
// 0.4 recenter, see rabbit.frontend/src/shared/constants/animation.ts).
// All clients — including the owner — see the drop at this delayed
// moment, which keeps a single source of truth for ordering across
// browsers. If frontend timing changes, update both sides.
const LIVEDROP_REVEAL_DELAY_MS = 7_900

// Stagger between drops in a multi-open burst. Matches
// `MULTI_OPEN_REVEAL_DELAY_MS` on the frontend so a count=5 reveal reads
// as a sequence of single opens, not a wall of cards landing in one frame.
const LIVEDROP_REVEAL_STAGGER_MS = 180

interface TicketRange {
  skinCase: SkinCase
  start: number
  end: number
}

@Injectable()
export class CaseService {
  constructor(
    @InjectRepository(Case)
    private caseRepository: Repository<Case>,
    @InjectRepository(Section)
    private sectionRepository: Repository<Section>,
    @InjectRepository(SkinCase)
    private skinCaseRepository: Repository<SkinCase>,
    @InjectRepository(CsgoSkin)
    private csgoSkinRepository: Repository<CsgoSkin>,
    @InjectRepository(DotaSkin)
    private dotaSkinRepository: Repository<DotaSkin>,
    private readonly userService: UserService,
    private readonly provablyFairService: ProvablyFairService,
    private readonly userInventoryService: UserInventoryService,
    private readonly userHistoryService: UserHistoryService,
    private readonly liveDropsService: LiveDropsService,
  ) {}

  /**
   * Manually attach skin entities to a case's skin_case rows when the
   * case is for Dota 2.
   *
   * Why: SkinCase declares a ManyToOne to CsgoSkin (legacy CSGO-only
   * design), so any TypeORM `relations: ['skinCases', 'skinCases.skin']`
   * call resolves the JOIN against csgo_skins only. For Dota cases,
   * skin_hash_name points at dota_skins → the JOIN returns null and
   * the API would emit empty skin objects. We catch that here:
   *
   *   1. Identify rows with null skin (= unresolved Dota hash_names).
   *   2. Look them up in dota_skins by market_hash_name.
   *   3. Patch each SkinCase.skin in memory (cast as DotaSkin).
   *
   * The `skin: CsgoSkin | DotaSkin` union on SkinCase makes this
   * type-safe without any cast at the call sites — they read shared
   * fields (image, market_price, market_hash_name, ...) which exist
   * on both entities.
   */
  private async hydrateDotaSkins(caseEntity: Case): Promise<void> {
    if (caseEntity.game_type !== 'dota' || !caseEntity.skinCases?.length) {
      return
    }

    const missingHashNames = caseEntity.skinCases
      .filter(sc => !sc.skin && sc.skin_hash_name)
      .map(sc => sc.skin_hash_name as string)

    if (missingHashNames.length === 0) return

    const dotaSkins = await this.dotaSkinRepository.find({
      where: { market_hash_name: In(missingHashNames) },
    })
    const byHashName = new Map(
      dotaSkins.map(s => [s.market_hash_name, s]),
    )

    for (const sc of caseEntity.skinCases) {
      if (!sc.skin && sc.skin_hash_name) {
        const dotaSkin = byHashName.get(sc.skin_hash_name)
        if (dotaSkin) {
          // SkinCase.skin is typed `CsgoSkin` to keep legacy CSGO
          // call sites simple — see SkinCase entity for the
          // rationale. Runtime substitutes a DotaSkin instance.
          sc.skin = dotaSkin as unknown as CsgoSkin
        }
      }
    }
  }

  /**
   * Publish a real (non-bot) drop to the LiveDrop feed.
   *
   * Takes a pre-loaded `user` instead of fetching it inside — for a
   * `count=5` multi-open this turns 5 redundant SELECTs into 1. Caller is
   * expected to pass null if the user lookup failed; we'll fall back to a
   * generated handle so the feed entry still publishes.
   *
   * Errors here must not break the case-opening flow — pushDrop swallows
   * Redis failures internally, so the worst case is a missing feed entry.
   */
  private async publishLiveDrop(
    winner: SkinCase,
    caseEntity: Case,
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
        name: winner.skin.name,
        market_hash_name: winner.skin.market_hash_name,
        image: winner.skin.image,
        market_price: winner.skin.market_price,
        quality: winner.skin.quality,
        name_color: winner.skin.name_color,
        background_color: winner.skin.background_color,
      },
      case: {
        id: caseEntity.id,
        slug: caseEntity.slug,
        name: caseEntity.name,
        img_url: caseEntity.img_url,
      },
      isBot: false,
      ts: Date.now(),
    }

    await this.liveDropsService.pushDrop(payload)
  }

  /**
   * Best-effort user lookup for LiveDrop publishing. Wrapped so a failure
   * here can never propagate up and abort openCase — feed enrichment is
   * cosmetic, the case opening itself is the user's intent.
   */
  private async loadUserForLiveDrop(userId: number): Promise<User | null> {
    try {
      return await this.userService.findById(userId)
    } catch {
      return null
    }
  }

  async findAll(gameType?: 'csgo' | 'dota'): Promise<Case[]> {
    const cases = await this.caseRepository.find({
      where: gameType ? { game_type: gameType } : {},
      relations: ['skinCases', 'skinCases.skin'],
      order: {
        skinCases: {
          skin: {
            market_price: 'DESC',
          },
        },
      },
    })
    // Patch Dota skin_case rows whose ManyToOne to CsgoSkin came back
    // null (because skin_hash_name lives in dota_skins, not csgo_skins).
    await Promise.all(cases.map(c => this.hydrateDotaSkins(c)))
    return cases
  }

  async findById(id: number): Promise<Case> {
    const caseEntity = await this.caseRepository.findOne({
      where: { id },
      relations: ['skinCases', 'skinCases.skin'],
      order: {
        skinCases: {
          skin: {
            market_price: 'DESC',
          },
        },
      },
    })
    if (!caseEntity) {
      throw new NotFoundException('Case not found')
    }
    await this.hydrateDotaSkins(caseEntity)
    return caseEntity
  }

  async findBySlug(slug: string): Promise<Case> {
    const caseEntity = await this.caseRepository.findOne({
      where: { slug },
      relations: ['skinCases', 'skinCases.skin'],
      order: {
        skinCases: {
          skin: {
            market_price: 'DESC',
          },
        },
      },
    })
    if (!caseEntity) {
      throw new NotFoundException('Case not found')
    }
    await this.hydrateDotaSkins(caseEntity)
    return caseEntity
  }

  async create(caseData: Partial<Case>, sectionId: number): Promise<Case> {
    const section = await this.sectionRepository.findOne({
      where: { id: sectionId },
    })
    if (!section) {
      throw new NotFoundException('Section not found')
    }
    const newCase = this.caseRepository.create({ ...caseData, section })
    return this.caseRepository.save(newCase)
  }

  // Вынесенная логика проверки существования кейса
  private async validateCase(caseId: number): Promise<Case> {
    const caseEntity = await this.caseRepository.findOne({
      where: { id: caseId },
    })
    if (!caseEntity) {
      throw new NotFoundException('Case not found')
    }
    return caseEntity
  }

  // Вынесенная логика подготовки билетов
  private prepareTicketRanges(skinCases: SkinCase[]): TicketRange[] {
    let ticketStart = 1
    return skinCases.map(skinCase => {
      if (!skinCase.chance || skinCase.chance <= 0) {
        throw new BadRequestException('Invalid skin chance')
      }

      const tickets = Math.floor(skinCase.chance * 100)
      const range: TicketRange = {
        skinCase,
        start: ticketStart,
        end: ticketStart + tickets - 1,
      }
      ticketStart += tickets
      return range
    })
  }

  // Вынесенная логика выбора победителя
  private selectWinner(
    ticketRanges: TicketRange[],
    randomNumber: number,
  ): SkinCase {
    const totalTickets = ticketRanges[ticketRanges.length - 1].end
    const randomTicket = Math.floor(randomNumber * totalTickets) + 1

    const winnerRange = ticketRanges.find(
      range => randomTicket >= range.start && randomTicket <= range.end,
    )

    if (!winnerRange) {
      throw new Error('Error selecting winner: No winner found')
    }

    return winnerRange.skinCase
  }

  // Вынесенная логика получения доступных скинов.
  //
  // Polymorphic: for Dota cases, the ManyToOne JOIN to CsgoSkin returns
  // null (hash_names live in dota_skins). We detect that and hydrate
  // from dota_skins manually. For CSGO the JOIN works as before.
  //
  // Filters out rows whose skin couldn't be resolved at all — those
  // would be orphaned skin_case rows (deleted skin in the source
  // table) and shouldn't participate in the lottery.
  private async getAvailableSkins(
    caseEntity: Case,
  ): Promise<SkinCase[]> {
    const skinCases = await this.skinCaseRepository.find({
      where: { case: { id: caseEntity.id }, is_drop_out: true },
      relations: ['skin'],
    })

    if (!skinCases?.length) {
      throw new NotFoundException('No valid skins available in this case')
    }

    if (caseEntity.game_type === 'dota') {
      const missing = skinCases
        .filter(sc => !sc.skin && sc.skin_hash_name)
        .map(sc => sc.skin_hash_name as string)

      if (missing.length > 0) {
        const dotaSkins = await this.dotaSkinRepository.find({
          where: { market_hash_name: In(missing) },
        })
        const byHashName = new Map(
          dotaSkins.map(s => [s.market_hash_name, s]),
        )
        for (const sc of skinCases) {
          if (!sc.skin && sc.skin_hash_name) {
            const dotaSkin = byHashName.get(sc.skin_hash_name)
            if (dotaSkin) sc.skin = dotaSkin as unknown as CsgoSkin
          }
        }
      }
    }

    const valid = skinCases.filter(sc => sc.skin != null)
    if (!valid.length) {
      throw new NotFoundException('No valid skins available in this case')
    }
    return valid
  }

  async openCase(
    caseId: number,
    userId: number,
    count: number = 1,
  ): Promise<{
    results: Array<{
      winner: SkinCase
      inventory: UserInventory
      game_id: number
    }>
    totalCost: number
  }> {
    // Валидация кейса
    const caseEntity = await this.validateCase(caseId)

    // Проверка лимитов
    if (count < 1 || count > 5) {
      throw new BadRequestException('Count must be between 1 and 5')
    }

    const totalCost = caseEntity.case_price * count

    // Проверка баланса и списание средств — один раз на всё событие.
    await this.userService.validateAndDeductBalance(userId, totalCost)

    // Single user lookup reused for all LiveDrop publishes in this call.
    // Loaded eagerly so the feed entry doesn't add latency to the
    // openCase response.
    const userPromise = this.loadUserForLiveDrop(userId)

    const results: Array<{
      winner: SkinCase
      inventory: UserInventory
      game_id: number
    }> = []
    // Drops are accumulated across the loop and persisted as one history
    // row at the end — that's the whole point of this refactor.
    const historyDrops: Array<{
      skin_id?: number
      skin_name?: string
      skin_img?: string
      skin_price?: number
      game_type?: 'csgo' | 'dota'
      server_seed?: string
    }> = []

    for (let i = 0; i < count; i++) {
      // Получение доступных скинов — polymorphic on case.game_type.
      const skinCases = await this.getAvailableSkins(caseEntity)

      // Каждый дроп получает свой clientSeed/serverSeed — провабли-фейр
      // верификация работает per-drop даже внутри одного события.
      const clientSeed = crypto.randomBytes(32).toString('hex')

      const provablyFair = await this.provablyFairService.generateSeed(
        userId,
        clientSeed,
        GameType.CASE,
      )

      const randomNumber = this.provablyFairService.generateRandomNumber(
        clientSeed,
        provablyFair.server_seed,
      )

      const ticketRanges = this.prepareTicketRanges(skinCases)
      const winner = this.selectWinner(ticketRanges, randomNumber)

      const inventory = await this.userInventoryService.createInventory(
        userId,
        winner.skin,
        caseEntity.game_type,
        caseEntity,
      )

      await this.provablyFairService.markSeedAsUsed(provablyFair.id)

      historyDrops.push({
        skin_id: winner.skin?.id,
        skin_name: winner.skin?.market_hash_name,
        skin_img: winner.skin?.image,
        skin_price: winner.skin?.market_price,
        game_type: caseEntity.game_type,
        server_seed: provablyFair.server_seed,
      })

      results.push({
        winner,
        inventory,
        game_id: provablyFair.id,
      })
    }

    // One history row per event — replaces the previous one-row-per-drop
    // pattern. For a count=5 multi-open this is now 1 INSERT instead of 5.
    // game_type is passed so the case_history row carries the discriminator
    // for fast frontend filters and so the per-drop entries inherit it.
    await this.userHistoryService.openCase(
      userId,
      caseId,
      caseEntity.name,
      caseEntity.case_price,
      caseEntity.img_url,
      historyDrops,
      caseEntity.game_type,
    )

    // LiveDrop publish is deferred until the spin animation finishes.
    // Every client (including the user who opened the case) sees the
    // drop at the same wall-clock moment — one global ts, no
    // owner-vs-others ordering split. Multi-open drops are staggered so
    // they reveal as a sequence rather than a wall of cards.
    //
    // setTimeout is fire-and-forget — `publishLiveDrop` swallows its own
    // errors internally, and a process restart in this 7.9s window means
    // the drop won't appear in the feed (acceptable: the inventory and
    // history rows are already committed, only the cosmetic feed entry
    // is lost). Swap for a persistent scheduler (BullMQ / Redis sorted
    // set) if the loss rate ever becomes user-visible.
    const user = await userPromise
    results.forEach((result, i) => {
      const delay =
        LIVEDROP_REVEAL_DELAY_MS + i * LIVEDROP_REVEAL_STAGGER_MS
      setTimeout(() => {
        void this.publishLiveDrop(result.winner, caseEntity, userId, user)
      }, delay)
    })

    return {
      results,
      totalCost,
    }
  }
}
