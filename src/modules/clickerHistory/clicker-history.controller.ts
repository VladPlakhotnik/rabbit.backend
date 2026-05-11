import {
  Controller,
  Get,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Request } from 'express'
import { User } from '../users/user.entity'
import { normalizePagination } from '../../common/pagination'
import { ClickerHistoryService } from './clicker-history.service'

@ApiTags('clicker-history')
@Controller('clicker/history')
@UseGuards(AuthGuard('jwt'))
export class ClickerHistoryController {
  constructor(private readonly clickerHistoryService: ClickerHistoryService) {}

  @ApiOperation({ summary: 'Get current user clicker history' })
  @ApiResponse({ status: 200, description: 'Clicker history page' })
  @Get()
  async getMyClickerHistory(
    @Req() req: Request & { user?: User },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    if (!req.user) {
      throw new UnauthorizedException('User not found')
    }

    return this.clickerHistoryService.getUserHistory(
      req.user.id,
      normalizePagination({ page, limit }),
    )
  }
}
