// src/skins/skin.controller.ts

import { Controller, Get, Param, Query } from '@nestjs/common'
import { SkinStorageService } from './skin-storage.service'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { SkinType, SkinRarity, SkinCondition } from './types/skin.types'

/**
 * Controller for working with skins
 * @class SkinController
 */

@ApiTags('skins')
@Controller('skins')
export class SkinController {
  constructor(private readonly skinStorageService: SkinStorageService) {}

  @ApiOperation({ summary: 'Get all skins' })
  @ApiResponse({ status: 200, description: 'Return all skins' })
  @Get()
  async getAllSkins(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 100,
  ) {
    return this.skinStorageService.getAllSkins(page, limit)
  }

  @ApiOperation({ summary: 'Get skin by id' })
  @ApiResponse({ status: 200, description: 'Return skin by id' })
  @Get(':id')
  async getSkinById(@Param('id') id: number) {
    return this.skinStorageService.getSkinById(id)
  }

  @ApiOperation({ summary: 'Search skins' })
  @ApiResponse({ status: 200, description: 'Return matching skins' })
  @Get('search/:query')
  async searchSkins(@Param('query') query: string) {
    return this.skinStorageService.searchSkins(query)
  }

  @ApiOperation({ summary: 'Get skins by type' })
  @ApiResponse({ status: 200, description: 'Return skins by type' })
  @Get('type/:type')
  async getSkinsByType(@Param('type') type: SkinType) {
    return this.skinStorageService.getSkinsByType(type)
  }

  @ApiOperation({ summary: 'Get skins by rarity' })
  @ApiResponse({ status: 200, description: 'Return skins by rarity' })
  @Get('rarity/:rarity')
  async getSkinsByRarity(@Param('rarity') rarity: SkinRarity) {
    return this.skinStorageService.getSkinsByRarity(rarity)
  }

  @ApiOperation({ summary: 'Get skins by condition' })
  @ApiResponse({ status: 200, description: 'Return skins by condition' })
  @Get('condition/:condition')
  async getSkinsByCondition(@Param('condition') condition: SkinCondition) {
    return this.skinStorageService.getSkinsByCondition(condition)
  }
}
