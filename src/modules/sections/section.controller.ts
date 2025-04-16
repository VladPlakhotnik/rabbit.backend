import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { SectionService } from './section.service'
import { Request } from 'express'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { AuthGuard } from '@nestjs/passport'
import { RolesGuard } from '../../core/guards/roles.guard'
import { Roles } from '../../core/decorators/roles.decorator'

/**
 * Controller for working with sections
 * @class SectionController
 */

@ApiTags('sections')
@Controller('sections')
export class SectionController {
  constructor(private readonly sectionService: SectionService) {}

  @ApiOperation({ summary: 'Get all sections' })
  @ApiResponse({ status: 200, description: 'Return all sections' })
  @Get()
  async getSections(
    @Req() req: Request,
    @Query('name') name?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('enoughBalance') enoughBalance?: string,
  ) {
    const user = req.user
    const userBalance = user ? user.balance : undefined

    const applyEnoughBalance =
      enoughBalance === 'true' && userBalance !== undefined

    return this.sectionService.findAll({
      name,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      applyEnoughBalance,
      userBalance,
    })
  }

  @ApiOperation({ summary: 'Get section by ID' })
  @ApiResponse({ status: 200, description: 'Return section by ID' })
  @Get(':id')
  async findOne(@Param('id') id: number) {
    return this.sectionService.findById(id)
  }

  @ApiOperation({ summary: 'Create a new section' })
  @ApiResponse({ status: 200, description: 'Return created section' })
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  @Post()
  async create(@Body('name') name: string) {
    return this.sectionService.create(name)
  }
}
