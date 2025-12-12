import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { UserHistoryService } from './userHistory.service'
import { Request } from 'express'

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

  @UseGuards(AuthGuard('jwt'))
  @Get('me/upgrades')
  async getMyUpgradeHistory(@Req() req: Request) {
    // @ts-ignore
    return this.userHistoryService.getUpgradeHistory(req.user.id)
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
