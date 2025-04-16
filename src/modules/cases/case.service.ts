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
  ) {}

  async findAll(): Promise<Case[]> {
    return this.caseRepository.find({ relations: ['section'] })
  }

  async findById(id: number): Promise<Case> {
    const caseEntity = await this.caseRepository.findOne({
      where: { id },
      relations: ['skinCases', 'skinCases.skin'],
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
      if (!skinCase.hidden_chance || skinCase.hidden_chance <= 0) {
        throw new BadRequestException('Invalid skin chance')
      }

      const tickets = Math.floor(skinCase.hidden_chance * 100)
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
    clientSeed: string,
  ): Promise<{ winner: SkinCase; inventory: UserInventory; game_id: number }> {
    // Валидация кейса
    const caseEntity = await this.validateCase(caseId)

    // Проверка баланса и списание средств
    await this.userService.validateAndDeductBalance(
      userId,
      caseEntity.case_price,
    )

    // Получение доступных скинов
    const skinCases = await this.getAvailableSkins(caseId)

    // Проверка Provably Fair
    const provablyFair = await this.provablyFairService.getLastUnusedSeed(
      userId,
      GameType.CASE,
    )

    if (!provablyFair || provablyFair.client_seed !== clientSeed) {
      throw new BadRequestException('Invalid or missing seed')
    }

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

    return {
      winner,
      inventory,
      game_id: provablyFair.id,
    }
  }
}
