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

  async findAll(filters: {
    name?: string
    minPrice?: number
    maxPrice?: number
    applyEnoughBalance?: boolean
    userBalance?: number
  }): Promise<Section[]> {
    const { name, minPrice, maxPrice, applyEnoughBalance, userBalance } =
      filters

    const queryBuilder = this.sectionRepository.createQueryBuilder('section')
    queryBuilder.leftJoinAndSelect('section.cases', 'cases')

    // Применение фильтра по имени
    if (name) {
      queryBuilder.andWhere('cases.name ILIKE :name', { name: `%${name}%` })
    }

    // Применение фильтра по минимальной цене
    if (minPrice !== undefined) {
      queryBuilder.andWhere('cases.case_price >= :minPrice', { minPrice })
    }

    // Применение фильтра по максимальной цене
    if (maxPrice !== undefined) {
      queryBuilder.andWhere('cases.case_price <= :maxPrice', { maxPrice })
    }

    // Применение фильтра на баланс пользователя
    if (applyEnoughBalance && userBalance !== undefined) {
      queryBuilder.andWhere('cases.case_price <= :userBalance', { userBalance })
      // Исключаем секции без подходящих кейсов
      queryBuilder.andWhere('cases.id IS NOT NULL')
    }

    // Сортировка результатов
    queryBuilder.orderBy('section.id', 'ASC').addOrderBy('cases.name', 'ASC')

    // Выполнение запроса и возврат результатов
    return queryBuilder.getMany()
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
