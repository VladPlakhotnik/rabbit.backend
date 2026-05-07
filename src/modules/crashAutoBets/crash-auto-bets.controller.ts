import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
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
  CreateCrashAutoBetDto,
  UpdateCrashAutoBetDto,
} from './dto/crash-auto-bet.dto'
import { CrashAutoBetsService } from './crash-auto-bets.service'

@ApiTags('crash-auto-bets')
@Controller('crash-auto-bets')
@UseGuards(AuthGuard('jwt'))
export class CrashAutoBetsController {
  constructor(private readonly crashAutoBetsService: CrashAutoBetsService) {}

  @ApiOperation({ summary: 'Get current user crash auto bet strategies' })
  @Get()
  async getStrategies(@Req() req: Request & { user?: User }) {
    const strategies = await this.crashAutoBetsService.getUserStrategies(
      this.getUserId(req),
    )

    return { strategies }
  }

  @ApiOperation({ summary: 'Create crash auto bet strategy' })
  @ApiResponse({ status: 201, description: 'Strategy created successfully' })
  @Post()
  async createStrategy(
    @Body() dto: CreateCrashAutoBetDto,
    @Req() req: Request & { user?: User },
  ) {
    return this.crashAutoBetsService.createStrategy(this.getUserId(req), dto)
  }

  @ApiOperation({ summary: 'Update crash auto bet strategy' })
  @Patch(':strategyId')
  async updateStrategy(
    @Param('strategyId', ParseIntPipe) strategyId: number,
    @Body() dto: UpdateCrashAutoBetDto,
    @Req() req: Request & { user?: User },
  ) {
    return this.crashAutoBetsService.updateStrategy(
      this.getUserId(req),
      strategyId,
      dto,
    )
  }

  @ApiOperation({ summary: 'Delete crash auto bet strategy' })
  @Delete(':strategyId')
  async deleteStrategy(
    @Param('strategyId', ParseIntPipe) strategyId: number,
    @Req() req: Request & { user?: User },
  ) {
    await this.crashAutoBetsService.deleteStrategy(
      this.getUserId(req),
      strategyId,
    )

    return { success: true }
  }

  private getUserId(req: Request & { user?: User }): number {
    if (!req.user) {
      throw new UnauthorizedException('User not found')
    }

    return req.user.id
  }
}
