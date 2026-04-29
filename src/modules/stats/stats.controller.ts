import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { Request } from 'express'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { StatsService } from './stats.service'
import { GlobalStatsDto } from './dto/global-stats.dto'
import { HeartbeatDto } from './dto/heartbeat.dto'
import { UserStatsDto } from './dto/user-stats.dto'
import { PresenceService } from '../../core/presence/presence.service'

@ApiTags('stats')
@Controller('stats')
export class StatsController {
  constructor(
    private readonly statsService: StatsService,
    private readonly presenceService: PresenceService,
  ) {}

  @ApiOperation({
    summary:
      'Public site-wide stats — powers the footer counters (online users, total players, games, total won).',
  })
  @ApiResponse({ status: 200, type: GlobalStatsDto })
  @Get('global')
  async getGlobalStats(): Promise<GlobalStatsDto> {
    return this.statsService.getGlobalStats()
  }

  @ApiOperation({
    summary:
      'Per-user stats for the profile page — games played, total won, biggest single win.',
  })
  @ApiResponse({ status: 200, type: UserStatsDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT' })
  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  async getCurrentUserStats(@Req() req: Request): Promise<UserStatsDto> {
    // @ts-ignore — passport injects user with id, same pattern used across
    // the codebase (userHistory.controller.ts, users.controller.ts).
    return this.statsService.getUserStats(req.user.id)
  }

  @ApiOperation({
    summary:
      'Presence heartbeat — keeps the caller marked online for the next ~90s. ' +
      'Browser sends one on load and every 45s while the tab is visible.',
  })
  @ApiResponse({ status: 204, description: 'Heartbeat accepted' })
  @Post('heartbeat')
  @HttpCode(204)
  async heartbeat(@Body() body: HeartbeatDto): Promise<void> {
    // Anonymous endpoint by design: anyone visiting the site counts as
    // online, registered or not. The id is supplied by the client so we
    // dedupe across tabs (localStorage) without server-side session state.
    await this.presenceService.touch(body.id)
  }
}
