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

  @ApiOperation({ summary: 'Get bonus wheel spin status (cooldown + last spin)' })
  @ApiResponse({ status: 200, description: 'Returns spin status' })
  @UseGuards(AuthGuard('jwt'))
  @Get('check-spin')
  async checkCanSpin(@Req() req: Request & { user?: User }) {
    if (!req.user) {
      throw new UnauthorizedException('User not authenticated')
    }
    return this.rewardsService.getSpinStatus(req.user.id)
  }

  @ApiOperation({ summary: 'Get active bonus wheel reward catalog' })
  @ApiResponse({ status: 200, description: 'Returns active wheel rewards' })
  @Get('catalog')
  async catalog() {
    return this.rewardsService.getCatalog()
  }

  @ApiOperation({ summary: 'Spin the bonus wheel' })
  @ApiResponse({ status: 200, description: 'Returns the won reward + sector index' })
  @UseGuards(AuthGuard('jwt'))
  @Post('spin')
  async spin(@Req() req: Request & { user?: User }) {
    if (!req.user) {
      throw new UnauthorizedException('User not authenticated')
    }
    return this.rewardsService.spin(req.user.id)
  }
}
