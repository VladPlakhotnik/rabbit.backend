import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { PartnerService } from './partner.service'

class UpdateReferralCodeDto {
  code!: string
}

class AttachReferralDto {
  code!: string
}

@ApiTags('partners')
@Controller('partners')
export class PartnerController {
  constructor(private readonly partnerService: PartnerService) {}

  @ApiOperation({
    summary: 'Get the partner-program rate card (Bronze..Diamond)',
  })
  @ApiResponse({
    status: 200,
    description:
      'Ordered list of partner levels with deposit thresholds and ' +
      'payout / bonus percentages. Public reference data — no auth ' +
      'guard so the level grid can render on the partnership page ' +
      'before the user signs in.',
  })
  @Get('levels')
  async getLevels() {
    return this.partnerService.getLevels()
  }

  @ApiOperation({ summary: 'Get partner dashboard for current user' })
  @ApiResponse({ status: 200, description: 'Partner dashboard data' })
  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  async getMyDashboard(@Request() req: { user?: { id: number } }) {
    if (!req.user?.id) {
      throw new BadRequestException('User not authenticated')
    }
    return this.partnerService.getDashboard(req.user.id)
  }

  @ApiOperation({ summary: 'List referrals attached to current user' })
  @ApiResponse({ status: 200, description: 'Referrals list' })
  @Get('me/referrals')
  @UseGuards(AuthGuard('jwt'))
  async getMyReferrals(@Request() req: { user?: { id: number } }) {
    if (!req.user?.id) {
      throw new BadRequestException('User not authenticated')
    }
    return this.partnerService.getReferrals(req.user.id)
  }

  @ApiOperation({ summary: 'Set custom referral code (Silver+, once per 30 days)' })
  @ApiResponse({ status: 200, description: 'Updated dashboard' })
  @Patch('me/code')
  @UseGuards(AuthGuard('jwt'))
  async setCustomCode(
    @Request() req: { user?: { id: number } },
    @Body() dto: UpdateReferralCodeDto,
  ) {
    if (!req.user?.id) {
      throw new BadRequestException('User not authenticated')
    }
    return this.partnerService.setCustomCode(req.user.id, dto.code)
  }

  @ApiOperation({
    summary:
      'Attach a referral code to current user (called by frontend after OAuth)',
  })
  @ApiResponse({ status: 200, description: 'Attach result' })
  @Post('me/referral/attach')
  @UseGuards(AuthGuard('jwt'))
  async attachReferral(
    @Request() req: { user?: { id: number } },
    @Body() dto: AttachReferralDto,
  ) {
    if (!req.user?.id) {
      throw new BadRequestException('User not authenticated')
    }
    const attached = await this.partnerService.attachAndBump(
      req.user.id,
      dto.code,
    )
    return { attached }
  }
}
