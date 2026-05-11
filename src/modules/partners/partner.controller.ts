import {
  Controller,
  Delete,
  Get,
  Patch,
  Param,
  Post,
  Body,
  Header,
  Query,
  Req,
  Res,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator'
import type { Request as ExpressRequest, Response } from 'express'
import { PartnerService } from './partner.service'
import { PartnerCampaignStatus } from './entities/partnerCampaign.entity'

class UpdateReferralCodeDto {
  @IsString()
  code!: string
}

class AttachReferralDto {
  @IsString()
  code!: string

  @IsOptional()
  @IsString()
  campaign?: string

  @IsOptional()
  @IsString()
  source?: string

  @IsOptional()
  @IsString()
  subId?: string
}

class TrackReferralImpressionDto {
  @IsString()
  code!: string

  @IsOptional()
  @IsString()
  source?: string

  @IsOptional()
  @IsString()
  campaign?: string

  @IsOptional()
  @IsString()
  subId?: string
}

class UpsertPartnerCampaignDto {
  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsString()
  slug?: string

  @IsOptional()
  @IsString()
  landing_path?: string

  @IsOptional()
  @IsString()
  source?: string

  @IsOptional()
  @IsString()
  sub_id?: string

  @IsOptional()
  @IsEnum(PartnerCampaignStatus)
  status?: PartnerCampaignStatus
}

class UpdatePartnerSettingsDto {
  @IsOptional()
  @IsBoolean()
  postback_enabled?: boolean

  @IsOptional()
  @IsString()
  postback_url?: string | null
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

  @ApiOperation({ summary: 'Get partner traffic and referral statistics' })
  @ApiResponse({ status: 200, description: 'Partner statistics' })
  @Get('me/statistics')
  @UseGuards(AuthGuard('jwt'))
  async getMyStatistics(
    @Request() req: { user?: { id: number } },
    @Query('periodDays') periodDays?: string,
    @Query('campaignId') campaignId?: string,
  ) {
    if (!req.user?.id) {
      throw new BadRequestException('User not authenticated')
    }

    return this.partnerService.getStatistics(
      req.user.id,
      periodDays ? Number(periodDays) : undefined,
      campaignId ? Number(campaignId) : undefined,
    )
  }

  @ApiOperation({ summary: 'Export partner statistics as CSV' })
  @ApiResponse({ status: 200, description: 'CSV export' })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Get('me/statistics/export')
  @UseGuards(AuthGuard('jwt'))
  async exportMyStatistics(
    @Request() req: { user?: { id: number } },
    @Res() res: Response,
    @Query('periodDays') periodDays?: string,
    @Query('campaignId') campaignId?: string,
  ) {
    if (!req.user?.id) {
      throw new BadRequestException('User not authenticated')
    }

    const csv = await this.partnerService.exportStatisticsCsv(
      req.user.id,
      periodDays ? Number(periodDays) : undefined,
      campaignId ? Number(campaignId) : undefined,
    )
    res.setHeader('Content-Disposition', 'attachment; filename="partner-stats.csv"')
    return res.send(csv)
  }

  @ApiOperation({ summary: 'List current user partner campaigns' })
  @ApiResponse({ status: 200, description: 'Campaign list' })
  @Get('me/campaigns')
  @UseGuards(AuthGuard('jwt'))
  async getMyCampaigns(@Request() req: { user?: { id: number } }) {
    if (!req.user?.id) {
      throw new BadRequestException('User not authenticated')
    }
    return this.partnerService.getCampaigns(req.user.id)
  }

  @ApiOperation({ summary: 'Create a partner campaign' })
  @ApiResponse({ status: 201, description: 'Created campaign' })
  @Post('me/campaigns')
  @UseGuards(AuthGuard('jwt'))
  async createMyCampaign(
    @Request() req: { user?: { id: number } },
    @Body() dto: UpsertPartnerCampaignDto,
  ) {
    if (!req.user?.id) {
      throw new BadRequestException('User not authenticated')
    }
    return this.partnerService.createCampaign(req.user.id, dto)
  }

  @ApiOperation({ summary: 'Update a partner campaign' })
  @ApiResponse({ status: 200, description: 'Updated campaign' })
  @Patch('me/campaigns/:id')
  @UseGuards(AuthGuard('jwt'))
  async updateMyCampaign(
    @Request() req: { user?: { id: number } },
    @Param('id') idFromParam: string | undefined,
    @Body() dto: UpsertPartnerCampaignDto,
  ) {
    if (!req.user?.id) {
      throw new BadRequestException('User not authenticated')
    }
    const id = Number(idFromParam)
    if (!Number.isFinite(id)) {
      throw new BadRequestException('Invalid campaign id')
    }
    return this.partnerService.updateCampaign(req.user.id, id, dto)
  }

  @ApiOperation({ summary: 'Delete an empty partner campaign' })
  @ApiResponse({ status: 200, description: 'Deleted campaign' })
  @Delete('me/campaigns/:id')
  @UseGuards(AuthGuard('jwt'))
  async deleteMyCampaign(
    @Request() req: { user?: { id: number } },
    @Param('id') idFromParam: string | undefined,
  ) {
    if (!req.user?.id) {
      throw new BadRequestException('User not authenticated')
    }
    const id = Number(idFromParam)
    if (!Number.isFinite(id)) {
      throw new BadRequestException('Invalid campaign id')
    }
    return this.partnerService.deleteCampaign(req.user.id, id)
  }

  @ApiOperation({ summary: 'Get partner commission ledger' })
  @ApiResponse({ status: 200, description: 'Partner ledger' })
  @Get('me/ledger')
  @UseGuards(AuthGuard('jwt'))
  async getMyLedger(@Request() req: { user?: { id: number } }) {
    if (!req.user?.id) {
      throw new BadRequestException('User not authenticated')
    }
    return this.partnerService.getLedger(req.user.id)
  }

  @ApiOperation({ summary: 'Get partner settings' })
  @ApiResponse({ status: 200, description: 'Partner settings' })
  @Get('me/settings')
  @UseGuards(AuthGuard('jwt'))
  async getMySettings(@Request() req: { user?: { id: number } }) {
    if (!req.user?.id) {
      throw new BadRequestException('User not authenticated')
    }
    return this.partnerService.getSettings(req.user.id)
  }

  @ApiOperation({ summary: 'Update partner settings' })
  @ApiResponse({ status: 200, description: 'Updated partner settings' })
  @Patch('me/settings')
  @UseGuards(AuthGuard('jwt'))
  async updateMySettings(
    @Request() req: { user?: { id: number } },
    @Body() dto: UpdatePartnerSettingsDto,
  ) {
    if (!req.user?.id) {
      throw new BadRequestException('User not authenticated')
    }
    return this.partnerService.updateSettings(req.user.id, dto)
  }

  @ApiOperation({ summary: 'List recent partner postback delivery attempts' })
  @ApiResponse({ status: 200, description: 'Postback delivery log' })
  @Get('me/postbacks/logs')
  @UseGuards(AuthGuard('jwt'))
  async getMyPostbackLogs(@Request() req: { user?: { id: number } }) {
    if (!req.user?.id) {
      throw new BadRequestException('User not authenticated')
    }
    return this.partnerService.getPostbackDeliveries(req.user.id)
  }

  @ApiOperation({ summary: 'Send a test postback event to current settings' })
  @ApiResponse({ status: 201, description: 'Test delivery result' })
  @Post('me/postbacks/test')
  @UseGuards(AuthGuard('jwt'))
  async sendMyTestPostback(@Request() req: { user?: { id: number } }) {
    if (!req.user?.id) {
      throw new BadRequestException('User not authenticated')
    }
    return this.partnerService.sendTestPostback(req.user.id)
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
      dto,
    )
    return { attached }
  }

  @ApiOperation({
    summary:
      'Track a referral-link visit for CPM analytics. Public and deduped server-side.',
  })
  @ApiResponse({ status: 200, description: 'Tracking result' })
  @Throttle({ default: { ttl: 60_000, limit: 180 } })
  @UseGuards(ThrottlerGuard)
  @Post('referral/impression')
  async trackReferralImpression(
    @Body() dto: TrackReferralImpressionDto,
    @Req() req: ExpressRequest,
  ) {
    const forwardedFor = req.headers['x-forwarded-for']
    const ip = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor?.split(',')[0]?.trim() || req.ip || ''
    const userAgent = req.headers['user-agent'] || ''

    return this.partnerService.trackReferralImpression({
      code: dto.code,
      source: dto.source,
      campaign: dto.campaign,
      subId: dto.subId,
      ip,
      userAgent,
    })
  }
}
