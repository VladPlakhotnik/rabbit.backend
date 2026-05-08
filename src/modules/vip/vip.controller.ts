import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { Request } from 'express'

import { User } from '../users/user.entity'
import { OpenVipCaseDto } from './dto/open-vip-case.dto'
import { VipRewardsService } from './vip-rewards.service'

@ApiTags('vip')
@Controller('vip')
@UseGuards(AuthGuard('jwt'))
export class VipController {
  constructor(private readonly vipRewardsService: VipRewardsService) {}

  @ApiOperation({ summary: 'Get current user VIP reward summary' })
  @Get('summary')
  async getSummary(@Req() req: Request & { user?: User }) {
    return this.vipRewardsService.getSummary(this.getUserId(req))
  }

  @ApiOperation({ summary: 'Claim available VIP cashback' })
  @Post('rewards/cashback/claim')
  async claimCashback(@Req() req: Request & { user?: User }) {
    return this.vipRewardsService.claimCashback(this.getUserId(req))
  }

  @ApiOperation({ summary: 'Get one VIP reward case' })
  @Get('cases/:caseId')
  async getVipCase(
    @Param('caseId') caseId: string,
    @Req() req: Request & { user?: User },
  ) {
    return this.vipRewardsService.getVipCase(this.getUserId(req), caseId)
  }

  @ApiOperation({ summary: 'Open a VIP reward case after cooldown checks' })
  @Post('cases/:caseId/open')
  async openVipCaseBySlug(
    @Param('caseId') caseId: string,
    @Req() req: Request & { user?: User },
  ) {
    return this.vipRewardsService.openVipCase(this.getUserId(req), caseId)
  }

  @ApiOperation({ summary: 'Open a VIP reward case' })
  @Post('cases/open')
  async openVipCase(
    @Body() body: OpenVipCaseDto,
    @Req() req: Request & { user?: User },
  ) {
    return this.vipRewardsService.openVipCase(this.getUserId(req), body.case_type)
  }

  private getUserId(req: Request & { user?: User }): number {
    if (!req.user) {
      throw new UnauthorizedException('User not found')
    }

    return req.user.id
  }
}
