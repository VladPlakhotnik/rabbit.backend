import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Section } from './section.entity'
import { Repository } from 'typeorm'

@Injectable()
export class SectionService {
  constructor(
    @InjectRepository(Section)
    private sectionRepository: Repository<Section>,
  ) {}

  async findAll(): Promise<Section[]> {
    return this.sectionRepository.find({
      relations: ['cases'],
      order: {
        name: 'ASC',
        cases: {
          name: 'ASC',
        },
      },
    })
  }

  async findById(id: number): Promise<Section> {
    const section = await this.sectionRepository.findOne({
      where: { id },
      relations: ['cases'],
    })
    if (!section) {
      throw new NotFoundException('Section not found')
    }
    return section
  }

  async create(name: string): Promise<Section> {
    const section = this.sectionRepository.create({ name })
    return this.sectionRepository.save(section)
  }
}
