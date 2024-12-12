// src/skins/skin.controller.ts

import { Controller, Get } from '@nestjs/common'
import { SkinService } from './skin.service'
import { Skin } from './skin.entity'

@Controller('skins')
export class SkinController {
  constructor(private readonly skinService: SkinService) {}

  // Маршрут для получения всех скинов
  @Get()
  async getAllSkins(): Promise<Skin[]> {
    return await this.skinService.getAllSkins()
  }
}
