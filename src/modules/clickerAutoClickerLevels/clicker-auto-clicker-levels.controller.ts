import { Controller, Get } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { ClickerAutoClickerLevelsService } from './clicker-auto-clicker-levels.service'

/**
 * Public read-only catalog endpoint. Anyone (auth or not) can ask
 * "what does an auto-clicker upgrade cost / how long does each tier
 * run?" — that's not user-specific data, no need to gate it. The
 * sensitive part (which tier the player is currently at) lives on
 * `GET /clicker-users/me`.
 */
@ApiTags('clicker-auto-clicker-levels')
@Controller('clicker-auto-clicker-levels')
export class ClickerAutoClickerLevelsController {
  constructor(
    private readonly service: ClickerAutoClickerLevelsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all auto-clicker upgrade tiers' })
  @ApiResponse({ status: 200, description: 'Auto-clicker level catalog' })
  findAll() {
    return this.service.findAll()
  }
}
