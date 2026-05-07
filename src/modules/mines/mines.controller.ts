import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Request } from 'express'
import { User } from '../users/user.entity'
import { CashoutDto, MakeMoveDto, StartGameDto } from './dto'
import { MinesService } from './mines.service'

@ApiTags('mines')
@Controller('mines')
@UseGuards(AuthGuard('jwt'))
export class MinesController {
  constructor(private readonly minesService: MinesService) {}

  @ApiOperation({ summary: 'Start new mines game' })
  @ApiResponse({ status: 200, description: 'Game started successfully' })
  @Post('start')
  async startGame(
    @Body() startGameDto: StartGameDto,
    @Req() req: Request & { user?: User },
  ) {
    return this.minesService.startGame(this.getUserId(req), startGameDto)
  }

  @ApiOperation({ summary: 'Make a move in mines game' })
  @ApiResponse({ status: 200, description: 'Move processed successfully' })
  @Post('move')
  async makeMove(
    @Body() makeMoveDto: MakeMoveDto,
    @Req() req: Request & { user?: User },
  ) {
    return this.minesService.makeMove(this.getUserId(req), makeMoveDto)
  }

  @ApiOperation({ summary: 'Cash out from mines game' })
  @ApiResponse({ status: 200, description: 'Cashout successful' })
  @Post('cashout')
  async cashout(
    @Body() cashoutDto: CashoutDto,
    @Req() req: Request & { user?: User },
  ) {
    return this.minesService.cashout(this.getUserId(req), cashoutDto)
  }

  @ApiOperation({ summary: 'Get current game session' })
  @ApiResponse({
    status: 200,
    description: 'Game session retrieved successfully',
  })
  @Get('active')
  async getActiveGameSession(@Req() req: Request & { user?: User }) {
    return this.minesService.getActiveGameSession(this.getUserId(req))
  }

  @Get('session/:sessionId')
  async getGameSession(
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @Req() req: Request & { user?: User },
  ) {
    return this.minesService.getGameSession(this.getUserId(req), sessionId)
  }

  @ApiOperation({ summary: 'Get user mines game history' })
  @ApiResponse({
    status: 200,
    description: 'Game history retrieved successfully',
  })
  @Get('history')
  async getGameHistory(@Req() req: Request & { user?: User }) {
    const games = await this.minesService.getGameHistory(this.getUserId(req))

    return { games }
  }

  @ApiOperation({ summary: 'Get mines top winners' })
  @ApiResponse({
    status: 200,
    description: 'Top winners retrieved successfully',
  })
  @Get('top-winners')
  async getTopWinners() {
    const games = await this.minesService.getTopWinners()

    return { games }
  }

  private getUserId(req: Request & { user?: User }): number {
    if (!req.user) {
      throw new UnauthorizedException('User not found')
    }

    return req.user.id
  }
}
