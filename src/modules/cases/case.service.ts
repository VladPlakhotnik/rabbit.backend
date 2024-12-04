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
import { User } from '../users/user.entity'

@Injectable()
export class CaseService {
  constructor(
    @InjectRepository(Case)
    private caseRepository: Repository<Case>,
    @InjectRepository(Section)
    private sectionRepository: Repository<Section>,
    @InjectRepository(SkinCase)
    private skinCaseRepository: Repository<SkinCase>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async findAll(): Promise<Case[]> {
    return this.caseRepository.find({ relations: ['section'] })
  }

  // async findById(id: number): Promise<Case> {
  //   const caseEntity = await this.caseRepository.findOne({
  //     where: { id },
  //   })
  //   if (!caseEntity) {
  //     throw new NotFoundException('Case not found')
  //   }
  //   return caseEntity
  // }

  async findById(id: number): Promise<Case> {
    const caseEntity = await this.caseRepository.findOne({
      where: { id },
      relations: ['skinCases', 'skinCases.skin'], // Include relations for skins
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

  async openCase(
    caseId: number,
    userId: number,
  ): Promise<{ winner: SkinCase }> {
    const user = await this.userRepository.findOne({ where: { id: userId } })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    const caseEntity = await this.caseRepository.findOne({
      where: { id: caseId },
    })
    if (!caseEntity) {
      throw new NotFoundException('Case not found')
    }

    if (user.balance < caseEntity.case_price) {
      throw new BadRequestException('Insufficient balance')
    }

    const skinCases = await this.skinCaseRepository.find({
      where: { case: { id: caseId }, is_drop_out: true },
      relations: ['skin'],
    })

    if (!skinCases || skinCases.length === 0) {
      throw new NotFoundException('No valid skins available in this case')
    }

    // Подготавливаем билетики для каждого скина
    let ticketStart = 1 // Начало диапазона билетиков
    const ticketRanges = skinCases.map(skinCase => {
      const tickets = Math.floor(Number(skinCase.hidden_chance) * 100) // Количество билетиков
      const range = {
        skinCase,
        start: ticketStart,
        end: ticketStart + tickets - 1,
      }
      ticketStart += tickets
      return range
    })

    // Общее количество билетиков
    const totalTickets = ticketRanges[ticketRanges.length - 1].end

    // Генерируем случайный билетик
    const randomTicket = Math.floor(Math.random() * totalTickets) + 1

    // Находим победителя
    const winnerRange = ticketRanges.find(
      range => randomTicket >= range.start && randomTicket <= range.end,
    )

    if (!winnerRange) {
      throw new Error('Error selecting winner: No winner found')
    } else {
      user.balance -= Number(caseEntity.case_price)
      user.opened_cases += 1

      await this.userRepository.save(user)
    }

    return { winner: winnerRange.skinCase }
  }
}
