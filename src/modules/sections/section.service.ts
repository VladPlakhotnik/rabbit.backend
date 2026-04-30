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
    // PR3a: filters cases by their game_type column. Sections with
    // only off-game cases come back with an empty `cases` array; the
    // frontend already skips empty sections in its render path.
    gameType?: 'csgo' | 'dota'
  }): Promise<Section[]> {
    const { name, minPrice, maxPrice, applyEnoughBalance, userBalance, gameType } =
      filters

    const queryBuilder = this.sectionRepository.createQueryBuilder('section')
    queryBuilder.leftJoinAndSelect('section.cases', 'cases')

    // Filter applied to the JOINed cases only — sections themselves
    // aren't game-typed, the partition is per-case. A section that
    // only carries off-game cases falls out of the result set
    // implicitly when its `cases` array becomes empty (FE filters
    // those).
    if (gameType) {
      queryBuilder.andWhere('cases.game_type = :gameType', { gameType })
    }

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
