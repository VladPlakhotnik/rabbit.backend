import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  UseGuards,
  Req,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common'
import { ProvablyFairService } from './provably-fair.service'
import { Request } from 'express'
import { User } from '../users/user.entity'
import { AuthGuard } from '@nestjs/passport'
import { ThrottlerGuard } from '@nestjs/throttler'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { GameType } from './enums/game-type.enum'

@ApiTags('provably-fair')
@Controller('provably-fair')
@UseGuards(ThrottlerGuard)
export class ProvablyFairController {
  constructor(private readonly provablyFairService: ProvablyFairService) {}

  @ApiOperation({ summary: 'Generate a new seed for a game' })
  @ApiResponse({ status: 200, description: 'Seed generated successfully' })
  @Post('generate')
  @UseGuards(AuthGuard('jwt'))
  async generateSeed(
    @Req() req: Request & { user?: User },
    @Query('client_seed') clientSeed: string,
    @Query('game_type') gameType: GameType,
    @Query('game_data') gameData?: string,
  ) {
    if (!req.user) {
      throw new UnauthorizedException('User not found')
    }

    if (!clientSeed || clientSeed.length < 32) {
      throw new BadRequestException(
        'Client seed must be at least 32 characters long',
      )
    }

    if (!Object.values(GameType).includes(gameType)) {
      throw new BadRequestException('Invalid game type')
    }

    let parsedGameData
    if (gameData) {
      try {
        parsedGameData = JSON.parse(gameData)
      } catch (e) {
        throw new BadRequestException('Invalid game data format')
      }
    }

    return this.provablyFairService.generateSeed(
      req.user.id,
      clientSeed,
      gameType,
      parsedGameData,
    )
  }

  @ApiOperation({ summary: 'Get user games history' })
  @ApiResponse({ status: 200, description: 'Games retrieved successfully' })
  @Get('games')
  @UseGuards(AuthGuard('jwt'))
  async getUserGames(
    @Req() req: Request & { user?: User },
    @Query('game_type') gameType?: GameType,
  ) {
    if (!req.user) {
      throw new UnauthorizedException('User not found')
    }

    if (gameType && !Object.values(GameType).includes(gameType)) {
      throw new BadRequestException('Invalid game type')
    }

    return this.provablyFairService.getUserGames(req.user.id, gameType)
  }

  @ApiOperation({ summary: 'Get game details' })
  @ApiResponse({
    status: 200,
    description: 'Game details retrieved successfully',
  })
  @Get('games/:gameId')
  @UseGuards(AuthGuard('jwt'))
  async getGameDetails(
    @Req() req: Request & { user?: User },
    @Param('gameId') gameId: number,
  ) {
    if (!req.user) {
      throw new UnauthorizedException('User not found')
    }

    return this.provablyFairService.getGameDetails(req.user.id, gameId)
  }

  @ApiOperation({ summary: 'Verify the result of a game' })
  @ApiResponse({ status: 200, description: 'Result verified successfully' })
  @Get('verify/:gameId')
  @UseGuards(AuthGuard('jwt'))
  async verifyResult(
    @Req() req: Request & { user?: User },
    @Param('gameId') gameId: number,
    @Query('client_seed') clientSeed: string,
    @Query('server_seed') serverSeed: string,
  ) {
    if (!req.user) {
      throw new UnauthorizedException('User not found')
    }

    if (!clientSeed || clientSeed.length < 32) {
      throw new BadRequestException(
        'Client seed must be at least 32 characters long',
      )
    }

    if (!serverSeed || serverSeed.length < 32) {
      throw new BadRequestException(
        'Server seed must be at least 32 characters long',
      )
    }

    return this.provablyFairService.verifyResult(gameId, clientSeed, serverSeed)
  }
}
