import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ClickerCase } from './entities/clicker_case.entity'
import { ClickerSkinCase } from './entities/clicker_skin_case.entity'
import { UpdateClickerCaseDto, CreateClickerCaseDto } from './dto'

@Injectable()
export class ClickerCasesService {
  constructor(
    @InjectRepository(ClickerCase)
    private readonly caseRepository: Repository<ClickerCase>,
    @InjectRepository(ClickerSkinCase)
    private readonly skinCaseRepository: Repository<ClickerSkinCase>,
  ) {}

  findAllCases() {
    return this.caseRepository.find()
  }

  findCaseById(id: number) {
    return this.caseRepository.findOne({
      where: { id },
      relations: ['skinCases'],
    })
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
}
