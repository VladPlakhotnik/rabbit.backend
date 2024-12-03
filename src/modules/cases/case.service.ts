import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Case } from './case.entity'
import { Repository } from 'typeorm'
import { Section } from '../sections/section.entity'

@Injectable()
export class CaseService {
  constructor(
    @InjectRepository(Case)
    private caseRepository: Repository<Case>,
    @InjectRepository(Section)
    private sectionRepository: Repository<Section>,
  ) {}

  async findAll(): Promise<Case[]> {
    return this.caseRepository.find({ relations: ['section'] })
  }

  async findById(id: number): Promise<Case> {
    const caseEntity = await this.caseRepository.findOne({
      where: { id },
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
}
