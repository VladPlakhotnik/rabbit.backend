import { Injectable, OnModuleInit } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'
import {
  Skin,
  SkinResponse,
  SkinType,
  SkinRarity,
  SkinCondition,
} from './types/skin.types'
import * as fs from 'fs'
import * as path from 'path'

@Injectable()
export class SkinStorageService implements OnModuleInit {
  private skins: Skin[] = []
  private lastUpdate: number = 0
  private readonly updateInterval = 5 * 60 * 1000 // 5 минут
  private readonly dataPath: string

  constructor(private readonly httpService: HttpService) {
    // Определяем путь к файлу в зависимости от окружения
    const isDev = process.env.NODE_ENV !== 'production'
    this.dataPath = isDev
      ? path.join(
          process.cwd(),
          'src',
          'modules',
          'skins',
          'data',
          'skins.json',
        )
      : path.join(
          process.cwd(),
          'dist',
          'modules',
          'skins',
          'data',
          'skins.json',
        )
  }

  async onModuleInit() {
    await this.loadSkins()
    setInterval(() => this.updateSkins(), this.updateInterval)
  }

  private async loadSkins() {
    try {
      if (!fs.existsSync(this.dataPath)) {
        const initialData: SkinResponse = {
          items: [],
          count: 0,
          updatedAt: Math.floor(Date.now() / 1000),
        }
        fs.mkdirSync(path.dirname(this.dataPath), { recursive: true })
        fs.writeFileSync(this.dataPath, JSON.stringify(initialData, null, 2))
      }

      const data = fs.readFileSync(this.dataPath, 'utf8')
      const response: SkinResponse = JSON.parse(data)

      if (response.items) {
        this.skins = response.items
        this.lastUpdate = response.updatedAt
      }
    } catch (error) {
      const initialData: SkinResponse = {
        items: [],
        count: 0,
        updatedAt: Math.floor(Date.now() / 1000),
      }
      fs.writeFileSync(this.dataPath, JSON.stringify(initialData, null, 2))
    }
  }

  private async updateSkins() {
    try {
      // Здесь можно добавить логику для обновления цен и других данных
      // Например, парсинг с других источников или API

      // Обновляем timestamp
      this.lastUpdate = Math.floor(Date.now() / 1000)

      // Сохраняем обновленные данные
      const response: SkinResponse = {
        items: this.skins,
        count: this.skins.length,
        updatedAt: this.lastUpdate,
      }

      fs.writeFileSync(this.dataPath, JSON.stringify(response, null, 2))
    } catch (error) {
      console.error('Failed to update skins:', error)
    }
  }

  getAllSkins(page: number = 1, limit: number = 100) {
    const start = (page - 1) * limit
    const end = start + limit
    const paginatedItems = this.skins.slice(start, end)

    return {
      items: paginatedItems,
      total: this.skins.length,
      page,
      limit,
      updatedAt: this.lastUpdate,
    }
  }

  getSkinById(id: number) {
    return this.skins.find(skin => skin.id === id)
  }

  searchSkins(query: string) {
    const searchQuery = query.toLowerCase()
    return this.skins.filter(skin =>
      skin.marketName.toLowerCase().includes(searchQuery),
    )
  }

  getSkinsByType(type: SkinType) {
    return this.skins.filter(skin => {
      const skinType = this.getSkinType(skin)
      return skinType === type
    })
  }

  getSkinsByRarity(rarity: SkinRarity) {
    return this.skins.filter(skin => {
      const skinRarity = this.getSkinRarity(skin)
      return skinRarity === rarity
    })
  }

  getSkinsByCondition(condition: SkinCondition) {
    return this.skins.filter(skin => {
      const skinCondition = this.getSkinCondition(skin)
      return skinCondition === condition
    })
  }

  private getSkinType(skin: Skin): SkinType {
    const name = skin.marketName.toLowerCase()
    if (name.includes('knife')) return SkinType.KNIFE
    if (name.includes('gloves')) return SkinType.GLOVES
    if (name.includes('sticker')) return SkinType.STICKER
    if (name.includes('case')) return SkinType.CASE
    if (name.includes('graffiti')) return SkinType.GRAFFITI
    return SkinType.WEAPON
  }

  private getSkinRarity(skin: Skin): SkinRarity {
    const rarity = skin.extra.rarity
    switch (rarity) {
      case 1:
        return SkinRarity.CONSUMER
      case 2:
        return SkinRarity.INDUSTRIAL
      case 3:
        return SkinRarity.MILSPEC
      case 4:
        return SkinRarity.RESTRICTED
      case 5:
        return SkinRarity.CLASSIFIED
      case 6:
        return SkinRarity.COVERT
      case 7:
        return SkinRarity.RARE
      default:
        return SkinRarity.CONSUMER
    }
  }

  private getSkinCondition(skin: Skin): SkinCondition {
    const name = skin.marketName.toLowerCase()
    if (name.includes('factory new')) return SkinCondition.FACTORY_NEW
    if (name.includes('minimal wear')) return SkinCondition.MINIMAL_WEAR
    if (name.includes('field-tested')) return SkinCondition.FIELD_TESTED
    if (name.includes('well-worn')) return SkinCondition.WELL_WORN
    if (name.includes('battle-scarred')) return SkinCondition.BATTLE_SCARRED
    return SkinCondition.FACTORY_NEW
  }
}
