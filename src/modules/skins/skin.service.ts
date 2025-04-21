// src/skins/skin.service.ts

import { Injectable, OnModuleInit } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'

interface Skin {
  id: number
  appId: number
  marketName: string
  stock: number
  priceUsd: string
  extra: {
    n: string[]
    t: number
    g: number | null
    e: number | null
    r: number
    s: boolean
    st: boolean
  }
}

@Injectable()
export class SkinService implements OnModuleInit {
  private skins: Skin[] = []
  private lastUpdate: number = 0
  private readonly updateInterval = 5 * 60 * 1000 // 5 минут

  constructor(private readonly httpService: HttpService) {}

  async onModuleInit() {
    await this.updateSkins()
    setInterval(() => this.updateSkins(), this.updateInterval)
  }

  private async updateSkins() {
    try {
      console.log('Updating skins data...')
      const response = await firstValueFrom(
        this.httpService.get('https://6cs.fail/cdn/items/730.json', {
          params: {
            'cache-burst': Date.now(),
          },
        }),
      )

      if (response.data.items) {
        this.skins = response.data.items
        this.lastUpdate = response.data.updatedAt
        console.log(`Skins updated successfully. Total: ${this.skins.length}`)
      }
    } catch (error) {
      console.error('Failed to update skins:', error)
    }
  }

  async getAllSkins(page: number = 1, limit: number = 100) {
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

  async getSkinById(id: number) {
    return this.skins.find(skin => skin.id === id)
  }

  async searchSkins(query: string) {
    const searchQuery = query.toLowerCase()
    return this.skins.filter(skin =>
      skin.marketName.toLowerCase().includes(searchQuery),
    )
  }
}
