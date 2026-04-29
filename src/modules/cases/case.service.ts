import * as crypto from 'crypto'
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Case } from './case.entity'
import { Repository } from 'typeorm'
import { Section } from '../sections/section.entity'
import { SkinCase } from '../skinCase/skinCase.entity'
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
    private readonly userService: UserService,
    private readonly provablyFairService: ProvablyFairService,
    private readonly userInventoryService: UserInventoryService,
    private readonly userHistoryService: UserHistoryService,
    private readonly liveDropsService: LiveDropsService,
  ) {}

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

  async findAll(): Promise<Case[]> {
    return this.caseRepository.find({
      relations: ['skinCases', 'skinCases.skin'],
      order: {
        skinCases: {
          skin: {
            market_price: 'DESC',
          },
        },
      },
    })
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

  // Вынесенная логика получения доступных скинов
  private async getAvailableSkins(caseId: number): Promise<SkinCase[]> {
    const skinCases = await this.skinCaseRepository.find({
      where: { case: { id: caseId }, is_drop_out: true },
      relations: ['skin'],
    })

    if (!skinCases?.length) {
      throw new NotFoundException('No valid skins available in this case')
    }

    return skinCases
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
      server_seed?: string
    }> = []

    for (let i = 0; i < count; i++) {
      // Получение доступных скинов
      const skinCases = await this.getAvailableSkins(caseId)

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
        caseEntity,
      )

      await this.provablyFairService.markSeedAsUsed(provablyFair.id)

      historyDrops.push({
        skin_id: winner.skin?.id,
        skin_name: winner.skin?.market_hash_name,
        skin_img: winner.skin?.image,
        skin_price: winner.skin?.market_price,
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
    await this.userHistoryService.openCase(
      userId,
      caseId,
      caseEntity.name,
      caseEntity.case_price,
      caseEntity.img_url,
      historyDrops,
    )

    // LiveDrop is still per-drop — the feed should reflect each box
    // landing, not collapse a multi-open into one card. publishLiveDrop
    // resolves the user once via the shared promise.
    const user = await userPromise
    for (const result of results) {
      await this.publishLiveDrop(result.winner, caseEntity, userId, user)
    }

    return {
      results,
      totalCost,
    }
  }
}
