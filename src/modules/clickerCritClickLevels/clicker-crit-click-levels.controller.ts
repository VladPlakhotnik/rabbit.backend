import { Controller, Get } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { ClickerCritClickLevelsService } from './clicker-crit-click-levels.service'

@ApiTags('clicker-crit-click-levels')
@Controller('clicker-crit-click-levels')
export class ClickerCritClickLevelsController {
  constructor(
    private readonly service: ClickerCritClickLevelsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all crit-click upgrade tiers' })
  @ApiResponse({ status: 200, description: 'Crit-click level catalog' })
  findAll() {
    return this.service.findAll()
  }
}
