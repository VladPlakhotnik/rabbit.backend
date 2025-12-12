import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Case } from '../cases/case.entity'
import { SkinCase } from '../skinCase/skinCase.entity'
import { LiveDrop } from './entities/live-drop.entity'

@Injectable()
export class LiveDropsService {
  constructor(
    @InjectRepository(Case)
    private caseRepository: Repository<Case>,
    @InjectRepository(SkinCase)
    private skinCaseRepository: Repository<SkinCase>,
    @InjectRepository(LiveDrop)
    private liveDropRepository: Repository<LiveDrop>,
  ) {}

  async generateRandomDrop() {
    // Get random case
    const cases = await this.caseRepository.find()
    const randomCase = cases[Math.floor(Math.random() * cases.length)]

    // Get available skins for this case
    const skinCases = await this.skinCaseRepository.find({
      where: { case: { id: randomCase.id }, is_drop_out: true },
      relations: ['skin'],
    })

    if (!skinCases.length) {
      return null
    }

    // Get random skin from available skins
    const randomSkinCase =
      skinCases[Math.floor(Math.random() * skinCases.length)]
    const randomSkin = randomSkinCase.skin

    return {
      skin: randomSkin,
      case: randomCase,
      timestamp: new Date(),
    }
  }

  async getRecentDrops(limit: number = 10) {
    return this.liveDropRepository.find({
      relations: ['skin', 'case'],
      order: { created_at: 'DESC' },
      take: limit,
    })
  }
}
