import {
  Controller,
  Get,
  Param,
  Req,
  Post,
  Body,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common'
import { Request } from 'express'
import { CaseService } from './case.service'
import { Roles } from '../../core/decorators/roles.decorator'
import { AuthGuard } from '@nestjs/passport'
import { RolesGuard } from '../../core/guards/roles.guard'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { User } from '../users/user.entity'

/**
 * Controller for working with cases
 * @class CaseController
 */

@ApiTags('cases')
@Controller('cases')
export class CaseController {
  constructor(private readonly caseService: CaseService) {}

  @ApiOperation({ summary: 'Get all cases' })
  @ApiResponse({ status: 200, description: 'Return all cases' })
  @UseGuards(AuthGuard('jwt'))
  @Get()
  async findAll() {
    return this.caseService.findAll()
  }

  @ApiOperation({ summary: 'Get case by ID' })
  @ApiResponse({ status: 200, description: 'Return case by ID' })
  // @UseGuards(AuthGuard('jwt'))
  @Get(':id')
  async findOne(@Param('id') id: number) {
    const caseEntity = await this.caseService.findById(id)

    const response = {
      id: caseEntity.id,
      name: caseEntity.name,
      img_url: caseEntity.img_url,
      case_price: caseEntity.case_price,
      max_count: caseEntity.max_count,
      remaining_count: caseEntity.remaining_count,
      is_limited: caseEntity.is_limited,
      is_popular: caseEntity.is_popular,
      skins: caseEntity.skinCases.map(skinCase => ({
        id: skinCase.skin.id,
        name: skinCase.skin.name,
        img_url: skinCase.skin.img_url,
        rarity: skinCase.skin.rarity,
        skin_price: skinCase.skin.skin_price,
        chance: skinCase.chance,
        is_drop_out: skinCase.is_drop_out,
      })),
    }

    return response
  }

  @ApiOperation({ summary: 'Open case(s)' })
  @ApiResponse({ status: 200, description: 'Return opened case(s)' })
  @UseGuards(AuthGuard('jwt'))
  @Post(':id/open')
  async openCase(
    @Param('id') id: number,
    @Req() req: Request & { user?: User },
    @Body('count') count: number = 1,
  ) {
    if (!req.user) {
      throw new UnauthorizedException('User not found')
    }

    // Передаем параметры в обновленный метод openCase
    return this.caseService.openCase(id, req.user.id, count)
  }

  @ApiOperation({ summary: 'Create a new case' })
  @ApiResponse({ status: 200, description: 'Return created case' })
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  @Post()
  async create(
    @Body('name') name: string,
    @Body('img_url') imgUrl: string,
    @Body('case_price') casePrice: number,
    @Body('section_id') sectionId: number,
  ) {
    const caseData = { name, img_url: imgUrl, case_price: casePrice }
    return this.caseService.create(caseData, sectionId)
  }
}
