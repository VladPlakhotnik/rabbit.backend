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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger'
import { AdminJwtGuard } from '../admin/guards/admin-jwt.guard'
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard'
import { AdminRoles } from '../admin/decorators/admin-roles.decorator'
import { AdminRole } from '../admin/types/admin-role.enum'
import { OptionalAuthGuard } from '../../core/guards/optional-auth.guard'

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
  @UseGuards(OptionalAuthGuard)
  @Get()
  async getSections(
    @Req() req: Request,
    @Query('name') name?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('enoughBalance') enoughBalance?: string,
    @Query('game') game?: string,
  ) {
    const user = req.user
    const userBalance = user ? user.balance : undefined

    const applyEnoughBalance =
      enoughBalance === 'true' && userBalance !== undefined

    // Whitelist game-type values; bad input falls through to "no
    // filter" rather than throwing — keeps the catalog endpoint
    // forgiving for stale frontends.
    const gameType =
      game === 'csgo' || game === 'dota' ? (game as 'csgo' | 'dota') : undefined

    return this.sectionService.findAll({
      name,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      applyEnoughBalance,
      userBalance,
      gameType,
    })
  }

  @ApiOperation({ summary: 'Get section by ID' })
  @ApiResponse({ status: 200, description: 'Return section by ID' })
  @Get(':id')
  async findOne(@Param('id') id: number) {
    return this.sectionService.findById(id)
  }

  @ApiOperation({ summary: 'Create a new section (admin panel)' })
  @ApiResponse({ status: 200, description: 'Return created section' })
  @ApiBearerAuth()
  @UseGuards(AdminJwtGuard, AdminRolesGuard)
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @Post()
  async create(@Body('name') name: string) {
    return this.sectionService.create(name)
  }
}
