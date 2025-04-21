import {
  Controller,
  Get,
  Post,
  UseGuards,
  Req,
  UnauthorizedException,
} from '@nestjs/common'
import { RewardsService } from './rewards.service'
import { AuthGuard } from '@nestjs/passport'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { Request } from 'express'
import { User } from '../users/user.entity'

@ApiTags('rewards')
@Controller('rewards')
export class RewardsController {
  constructor(private readonly rewardsService: RewardsService) {}

  @ApiOperation({ summary: 'Check if spin is available' })
  @ApiResponse({ status: 200, description: 'Returns spin availability' })
  @UseGuards(AuthGuard('jwt'))
  @Get('check-spin')
  async checkCanSpin(@Req() req: Request & { user?: User }) {
    if (!req.user) {
      throw new UnauthorizedException('User not authenticated')
    }
    const canSpin = await this.rewardsService.canUserSpin(req.user.id)
    return { canSpin }
  }

  @ApiOperation({ summary: 'Spin the wheel' })
  @ApiResponse({ status: 200, description: 'Returns the reward' })
  @UseGuards(AuthGuard('jwt'))
  @Post('spin')
  async spin(@Req() req: Request & { user?: User }) {
    if (!req.user) {
      throw new UnauthorizedException('User not authenticated')
    }
    const reward = await this.rewardsService.spin(req.user.id)
    return {
      message: 'Spin successful',
      reward,
    }
  }
}
