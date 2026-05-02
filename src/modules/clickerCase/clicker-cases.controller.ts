import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  Put,
  Delete,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Request as ExpressRequest } from 'express'
import { ClickerCasesService } from './clicker-cases.service'
import {
  CreateClickerCaseDto,
  UpdateClickerCaseDto,
  OpenClickerCaseDto,
} from './dto'

interface RequestWithUser extends Omit<ExpressRequest, 'user'> {
  user: { id: number }
}

@ApiTags('clicker-cases')
@Controller('clicker-cases')
export class ClickerCasesController {
  constructor(private readonly clickerCasesService: ClickerCasesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all clicker cases' })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'game', required: false, enum: ['csgo', 'dota'] })
  @ApiQuery({ name: 'balance', required: false, type: Number })
  @ApiQuery({ name: 'enoughBalance', required: false, type: Boolean })
  findAll(
    @Query('search') search?: string,
    @Query('game') game?: string,
    @Query('balance') balance?: string,
    @Query('enoughBalance') enoughBalance?: string,
  ) {
    // Query strings come in as `string | undefined`; coerce here so the
    // service stays typed.
    const parsedBalance = balance != null ? Number(balance) : undefined
    const parsedEnough =
      enoughBalance === 'true' || enoughBalance === '1'
    const gameType =
      game === 'csgo' || game === 'dota' ? game : undefined

    return this.clickerCasesService.findAllCases({
      search,
      gameType,
      balance: Number.isFinite(parsedBalance) ? parsedBalance : undefined,
      enoughBalance: parsedEnough,
    })
  }

  // Slug route MUST come before `:id` so `/clicker-cases/rabbit-starter`
  // is parsed as a slug, not as an id (which would 404 because the value
  // isn't a number).
  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get clicker case by slug' })
  findBySlug(@Param('slug') slug: string) {
    return this.clickerCasesService.findCaseBySlug(slug)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get clicker case by ID' })
  findOne(@Param('id') id: number) {
    return this.clickerCasesService.findCaseById(id)
  }

  @Post()
  @ApiOperation({ summary: 'Create a new clicker case' })
  create(@Body() dto: CreateClickerCaseDto) {
    return this.clickerCasesService.createCase(dto)
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a clicker case by ID' })
  update(@Param('id') id: number, @Body() dto: UpdateClickerCaseDto) {
    return this.clickerCasesService.updateCase(id, dto)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a clicker case by ID' })
  remove(@Param('id') id: number) {
    return this.clickerCasesService.removeCase(id)
  }

  @Post(':slug/open')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Open a clicker case by slug' })
  @ApiResponse({
    status: 200,
    description:
      'Returns the rolled skins, the total cost in carrots, and the user new balance',
  })
  @ApiResponse({ status: 400, description: 'Insufficient carrots / bad count' })
  @ApiResponse({ status: 404, description: 'Case not found' })
  open(
    @Param('slug') slug: string,
    @Body() dto: OpenClickerCaseDto,
    @Request() req: RequestWithUser,
  ) {
    return this.clickerCasesService.openCase(slug, req.user.id, dto.count ?? 1)
  }
}
