import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Case } from '../cases/case.entity'
import { Skin } from '../skins/skin.entity'
import { SkinCase } from '../skinCase/skinCase.entity'
import { LiveDrop } from './entities/live-drop.entity'

@Injectable()
export class LiveDropsService {
  constructor(
    @InjectRepository(Case)
    private caseRepository: Repository<Case>,
    @InjectRepository(Skin)
    private skinRepository: Repository<Skin>,
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
    const skin = randomSkinCase.skin

    // // Save drop to database
    // const liveDrop = this.liveDropRepository.create({
    //   skin,
    //   case: randomCase,
    //   username: 'Bot', // Можно заменить на реальное имя пользователя
    // })
    // await this.liveDropRepository.save(liveDrop)

    return {
      skin: {
        id: skin.id,
        name: skin.name,
        img_url: skin.img_url,
        rarity: skin.rarity,
        skin_price: skin.skin_price,
      },
      case: {
        id: randomCase.id,
        name: randomCase.name,
        img_url: randomCase.img_url,
      },
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
