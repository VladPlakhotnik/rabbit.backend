import {
  Controller,
  Get,
  Param,
  Query,
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
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { UserThrottlerGuard } from '../../core/guards/user-throttler.guard'
import { User } from '../users/user.entity'

/**
 * Controller for working with cases
 * @class CaseController
 */

// Apply rate limiting to every method. Per-user (or per-IP for anonymous)
// limits come from CaseModule's ThrottlerModule.forRoot — see there for
// defaults. Specific methods can override with @Throttle.
@UseGuards(UserThrottlerGuard)
@ApiTags('cases')
@Controller('cases')
export class CaseController {
  constructor(private readonly caseService: CaseService) {}

  @ApiOperation({ summary: 'Get all cases (optionally filtered by game)' })
  @ApiResponse({ status: 200, description: 'Return cases' })
  @ApiQuery({
    name: 'game',
    required: false,
    description: 'Filter by game type: "csgo" or "dota"',
  })
  @UseGuards(AuthGuard('jwt'))
  @Get()
  async findAll(@Query('game') game?: string) {
    // Whitelist the value — anything else falls through to "all
    // games", same behaviour as omitting the param. Belt-and-braces
    // even though the DB-side CHECK constraint would also reject
    // bad values.
    const gameType =
      game === 'csgo' || game === 'dota' ? (game as 'csgo' | 'dota') : undefined

    return this.caseService.findAll(gameType)
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
  // Burst protection on a money-spending endpoint. Allows ~5 opens/sec
  // (handles the user spamming the open button) while blocking automated
  // 100/sec floods. Each open also publishes a LiveDrop, so this doubles
  // as protection for the feed against a single client flooding it.
  @Throttle({ default: { ttl: 1_000, limit: 5 } })
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
