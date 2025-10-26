import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  UseGuards,
  UnauthorizedException,
  BadRequestException,
  Param,
} from '@nestjs/common'
import { Request } from 'express'
import { AuthGuard } from '@nestjs/passport'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { User } from '../users/user.entity'
import { StartGameDto, MakeMoveDto, CashoutDto } from './dto'
import { MinesService } from './mines.service'

@ApiTags('mines')
@Controller('mines')
@UseGuards(AuthGuard('jwt'))
export class MinesController {
  constructor(private readonly minesService: MinesService) {}

  @ApiOperation({ summary: 'Start new mines game' })
  @ApiResponse({
    status: 200,
    description: 'Game started successfully',
    schema: {
      type: 'object',
      properties: {
        game_session_id: { type: 'number', example: 1 },
        mines_count: { type: 'number', example: 3 },
        bet_amount: { type: 'number', example: 100 },
        multiplier: { type: 'number', example: 1.0 },
        field: {
          type: 'array',
          items: {
            type: 'array',
            items: { type: 'string', example: '?' },
          },
          example: [
            ['?', '?', '?', '?', '?'],
            ['?', '?', '?', '?', '?'],
            ['?', '?', '?', '?', '?'],
            ['?', '?', '?', '?', '?'],
            ['?', '?', '?', '?', '?'],
          ],
        },
      },
    },
  })
  @Post('start')
  async startGame(
    @Body() startGameDto: StartGameDto,
    @Req() req: Request & { user?: User },
  ) {
    if (!req.user) {
      throw new UnauthorizedException('User not found')
    }

    // Валидация: должен быть указан либо скин, либо сумма ставки
    if (!startGameDto.inventory_skin_id && !startGameDto.bet_amount) {
      throw new BadRequestException(
        'Either inventory_skin_id or bet_amount must be provided',
      )
    }

    if (startGameDto.inventory_skin_id && startGameDto.bet_amount) {
      throw new BadRequestException(
        'Cannot use both inventory_skin_id and bet_amount',
      )
    }

    const gameSession = await this.minesService.startGame(
      req.user.id,
      startGameDto,
    )

    return {
      game_session_id: gameSession.id,
      mines_count: gameSession.mines_count,
      bet_amount: gameSession.bet_amount,
      multiplier: gameSession.current_multiplier,
      field: gameSession.field,
      message: 'Game started successfully',
    }
  }

  @ApiOperation({ summary: 'Make a move in mines game' })
  @ApiResponse({
    status: 200,
    description: 'Move processed successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        is_mine: { type: 'boolean', example: false },
        is_diamond: { type: 'boolean', example: true },
        multiplier: { type: 'number', example: 1.15 },
        field: {
          type: 'array',
          items: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        message: {
          type: 'string',
          example: 'Diamond found! Multiplier increased.',
        },
      },
    },
  })
  @Post('move')
  async makeMove(
    @Body() makeMoveDto: MakeMoveDto,
    @Req() req: Request & { user?: User },
  ) {
    if (!req.user) {
      throw new UnauthorizedException('User not found')
    }

    const moveResult = await this.minesService.makeMove(
      req.user.id,
      makeMoveDto,
    )
    return moveResult
  }

  @ApiOperation({ summary: 'Cash out from mines game' })
  @ApiResponse({
    status: 200,
    description: 'Cashout successful',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        final_multiplier: { type: 'number', example: 1.35 },
        win_amount: { type: 'number', example: 135 },
        message: { type: 'string', example: 'Cashout successful!' },
      },
    },
  })
  @Post('cashout')
  async cashout(
    @Body() cashoutDto: CashoutDto,
    @Req() req: Request & { user?: User },
  ) {
    if (!req.user) {
      throw new UnauthorizedException('User not found')
    }

    const cashoutResult = await this.minesService.cashout(
      req.user.id,
      cashoutDto,
    )
    return cashoutResult
  }

  @ApiOperation({ summary: 'Get current game session' })
  @ApiResponse({
    status: 200,
    description: 'Game session retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        game_session_id: { type: 'number', example: 1 },
        status: { type: 'string', example: 'active' },
        mines_count: { type: 'number', example: 3 },
        current_multiplier: { type: 'number', example: 1.15 },
        field: {
          type: 'array',
          items: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    },
  })
  @Get('session/:sessionId')
  async getGameSession(
    @Param('sessionId') sessionId: number,
    @Req() req: Request & { user?: User },
  ) {
    if (!req.user) {
      throw new UnauthorizedException('User not found')
    }

    const session = await this.minesService.getGameSession(
      req.user.id,
      sessionId,
    )
    return {
      game_session_id: session.id,
      status: session.status,
      mines_count: session.mines_count,
      current_multiplier: session.current_multiplier,
      field: session.field,
    }
  }

  @ApiOperation({ summary: 'Get user mines game history' })
  @ApiResponse({
    status: 200,
    description: 'Game history retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        games: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number', example: 1 },
              status: { type: 'string', example: 'completed' },
              mines_count: { type: 'number', example: 3 },
              final_multiplier: { type: 'number', example: 1.35 },
              win_amount: { type: 'number', example: 135 },
              created_at: { type: 'string', example: '2024-01-01T00:00:00Z' },
            },
          },
        },
      },
    },
  })
  @Get('history')
  async getGameHistory(@Req() req: Request & { user?: User }) {
    if (!req.user) {
      throw new UnauthorizedException('User not found')
    }

    const games = await this.minesService.getGameHistory(req.user.id)
    return {
      games: games.map(game => ({
        id: game.id,
        status: game.status,
        mines_count: game.mines_count,
        final_multiplier: game.current_multiplier,
        win_amount: game.bet_amount * game.current_multiplier,
        created_at: game.created_at,
      })),
    }
  }
}
