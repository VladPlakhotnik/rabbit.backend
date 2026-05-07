import {
  Body,
  Controller,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Request } from 'express'
import { User } from '../users/user.entity'
import {
  CashoutCrashSessionDto,
  SettleCrashSessionDto,
  StartCrashGameDto,
} from './dto'
import { CrashService } from './crash.service'

@ApiTags('crash')
@Controller('crash')
@UseGuards(AuthGuard('jwt'))
export class CrashController {
  constructor(private readonly crashService: CrashService) {}

  @ApiOperation({ summary: 'Start crash bet session' })
  @ApiResponse({ status: 200, description: 'Crash bet session started' })
  @Post('start')
  async startGame(
    @Body() startGameDto: StartCrashGameDto,
    @Req() req: Request & { user?: User },
  ) {
    return this.crashService.startGame(this.getUserId(req), startGameDto)
  }

  @ApiOperation({ summary: 'Cash out a crash bet session' })
  @ApiResponse({ status: 200, description: 'Crash cashout processed' })
  @Post('cashout')
  async cashout(
    @Body() cashoutDto: CashoutCrashSessionDto,
    @Req() req: Request & { user?: User },
  ) {
    return this.crashService.cashout(this.getUserId(req), cashoutDto)
  }

  @ApiOperation({ summary: 'Settle a lost crash bet session' })
  @ApiResponse({ status: 200, description: 'Crash session settled' })
  @Post('settle')
  async settle(
    @Body() settleDto: SettleCrashSessionDto,
    @Req() req: Request & { user?: User },
  ) {
    return this.crashService.settle(this.getUserId(req), settleDto)
  }

  private getUserId(req: Request & { user?: User }): number {
    if (!req.user) {
      throw new UnauthorizedException('User not found')
    }

    return req.user.id
  }
}
