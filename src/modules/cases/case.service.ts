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
  ) {}

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

    // Если открываем один кейс
    if (count === 1) {
      // Проверка баланса и списание средств
      await this.userService.validateAndDeductBalance(
        userId,
        caseEntity.case_price,
      )

      // Получение доступных скинов
      const skinCases = await this.getAvailableSkins(caseId)

      const clientSeed = crypto.randomBytes(32).toString('hex')

      const provablyFair = await this.provablyFairService.generateSeed(
        userId,
        clientSeed,
        GameType.CASE,
      )

      // Генерация случайного числа
      const randomNumber = this.provablyFairService.generateRandomNumber(
        clientSeed,
        provablyFair.server_seed,
      )

      // Подготовка и выбор победителя
      const ticketRanges = this.prepareTicketRanges(skinCases)
      const winner = this.selectWinner(ticketRanges, randomNumber)

      // Создание записи в инвентаре
      const inventory = await this.userInventoryService.createInventory(
        userId,
        winner.skin,
        caseEntity,
      )

      // Помечаем сид как использованный
      await this.provablyFairService.markSeedAsUsed(provablyFair.id)

      await this.userHistoryService.openCase(
        userId,
        caseId,
        caseEntity.name,
        caseEntity.case_price,
        caseEntity.img_url,
        provablyFair.server_seed,
        winner.skin?.id,
        winner.skin?.image,
        winner.skin?.market_price,
      )

      return {
        results: [
          {
            winner,
            inventory,
            game_id: provablyFair.id,
          },
        ],
        totalCost: caseEntity.case_price,
      }
    }

    // Если открываем несколько кейсов
    const totalCost = caseEntity.case_price * count

    // Проверка баланса и списание средств
    await this.userService.validateAndDeductBalance(userId, totalCost)

    const results = []

    // Открываем указанное количество кейсов
    for (let i = 0; i < count; i++) {
      // Получение доступных скинов
      const skinCases = await this.getAvailableSkins(caseId)

      // Генерация уникального сида для каждого кейса
      const clientSeed = crypto.randomBytes(32).toString('hex')

      const provablyFair = await this.provablyFairService.generateSeed(
        userId,
        clientSeed,
        GameType.CASE,
      )

      // Генерация случайного числа
      const randomNumber = this.provablyFairService.generateRandomNumber(
        clientSeed,
        provablyFair.server_seed,
      )

      // Подготовка и выбор победителя
      const ticketRanges = this.prepareTicketRanges(skinCases)
      const winner = this.selectWinner(ticketRanges, randomNumber)

      // Создание записи в инвентаре
      const inventory = await this.userInventoryService.createInventory(
        userId,
        winner.skin,
        caseEntity,
      )

      // Помечаем сид как использованный
      await this.provablyFairService.markSeedAsUsed(provablyFair.id)

      // Записываем в историю
      await this.userHistoryService.openCase(
        userId,
        caseId,
        caseEntity.name,
        caseEntity.case_price,
        caseEntity.img_url,
        provablyFair.server_seed,
        winner.skin?.id,
        winner.skin?.image,
        winner.skin?.market_price,
      )

      results.push({
        winner,
        inventory,
        game_id: provablyFair.id,
      })
    }

    return {
      results,
      totalCost,
    }
  }
}
