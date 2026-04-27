import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { UserHistoryService } from './userHistory.service'
import { Request } from 'express'
import { UpgradeHistoryItemDto } from './dto/upgrade-history-item.dto'
import { UpgradeHistoryDetailDto } from './dto/upgrade-history-detail.dto'

@ApiTags('history')
@Controller('history')
export class UserHistoryController {
  constructor(private readonly userHistoryService: UserHistoryService) {}

  // Универсальная ручка с фильтрами для текущего пользователя
  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  async getMyHistory(
    @Req() req: Request,
    @Query('action') action?: string,
    @Query('relatedTable') relatedTable?: string,
    @Query('limit') limit?: number,
  ) {
    // @ts-ignore
    const userId = req.user.id

    if (action || relatedTable) {
      return this.userHistoryService.getFilteredHistory(userId, {
        action,
        relatedTable,
        limit: limit || 50,
      })
    }
    return this.userHistoryService.getUserHistory(userId)
  }

  // Отдельные ручки для каждой игры для текущего пользователя
  @UseGuards(AuthGuard('jwt'))
  @Get('me/cases')
  async getMyCaseHistory(@Req() req: Request) {
    // @ts-ignore
    return this.userHistoryService.getCaseHistory(req.user.id)
  }

  @ApiOperation({ summary: 'Upgrade history for the current user' })
  @ApiResponse({
    status: 200,
    description:
      'Upgrade attempts (both wins and losses), most recent first. Pre-migration rows ' +
      'surface with chance/skin_price = 0 and success = false.',
    type: [UpgradeHistoryItemDto],
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT' })
  @UseGuards(AuthGuard('jwt'))
  @Get('me/upgrades')
  async getMyUpgradeHistory(
    @Req() req: Request,
  ): Promise<UpgradeHistoryItemDto[]> {
    // @ts-ignore
    return this.userHistoryService.getUpgradeHistory(req.user.id)
  }

  @ApiOperation({
    summary:
      'Detailed view of a single upgrade — powers the "Результат игры" modal',
  })
  @ApiResponse({ status: 200, type: UpgradeHistoryDetailDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT' })
  @ApiResponse({
    status: 404,
    description: 'Upgrade not found or belongs to a different user',
  })
  @UseGuards(AuthGuard('jwt'))
  @Get('me/upgrades/:id')
  async getMyUpgradeHistoryDetail(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<UpgradeHistoryDetailDto> {
    // @ts-ignore
    return this.userHistoryService.getUpgradeHistoryDetail(req.user.id, id)
  }

  // Детальная история с полной информацией для текущего пользователя
  @UseGuards(AuthGuard('jwt'))
  @Get('me/details')
  async getMyHistoryWithDetails(@Req() req: Request) {
    // @ts-ignore
    return this.userHistoryService.getHistoryWithDetails(req.user.id)
  }

  // Статистика по играм для текущего пользователя
  @UseGuards(AuthGuard('jwt'))
  @Get('me/stats')
  async getMyGameStats(@Req() req: Request) {
    // @ts-ignore
    return this.userHistoryService.getGameStats(req.user.id)
  }
}
