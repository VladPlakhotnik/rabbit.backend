// src/skins/skin.controller.ts

import { Controller, Get } from '@nestjs/common'
import { SkinService } from './skin.service'
import { Skin } from './skin.entity'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'

/**
 * Controller for working with skins
 * @class SkinController
 */

@ApiTags('skins')
@Controller('skins')
export class SkinController {
  constructor(private readonly skinService: SkinService) {}

  @ApiOperation({ summary: 'Get all skins' })
  @ApiResponse({ status: 200, description: 'Return all skins' })
  @Get()
  async getAllSkins(): Promise<Skin[]> {
    return await this.skinService.getAllSkins()
  }
}
