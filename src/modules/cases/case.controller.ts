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

  @ApiOperation({ summary: 'Get case by slug' })
  @ApiResponse({ status: 200, description: 'Return case by slug' })
  @Get(':slug')
  async findBySlug(@Param('slug') slug: string) {
    const response = await this.caseService.findBySlug(slug)

    return response
  }

  @ApiOperation({ summary: 'Open case(s) by slug' })
  @ApiResponse({ status: 200, description: 'Return opened case(s)' })
  @UseGuards(AuthGuard('jwt'))
  @Post(':slug/open')
  async openCaseBySlug(
    @Param('slug') slug: string,
    @Req() req: Request & { user?: User },
    @Body('count') count: number = 1,
  ) {
    if (!req.user) {
      throw new UnauthorizedException('User not found')
    }

    // Получаем кейс по slug и передаем его id в openCase
    const caseEntity = await this.caseService.findBySlug(slug)
    return this.caseService.openCase(caseEntity.id, req.user.id, count)
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
