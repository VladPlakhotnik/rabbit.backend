import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { Throttle } from '@nestjs/throttler'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Request } from 'express'

import { UserThrottlerGuard } from '../../core/guards/user-throttler.guard'
import { User } from '../users/user.entity'
import { CreateEarnVaultPositionDto } from './dto/create-earn-vault-position.dto'
import { EarnVaultService } from './earn-vault.service'

const EARN_VAULT_POSITION_ID_PATTERN = /^[1-9]\d{0,18}$/

@ApiTags('earn-vault')
@ApiBearerAuth()
@Controller('earn-vault')
@UseGuards(AuthGuard('jwt'), UserThrottlerGuard)
export class EarnVaultController {
  constructor(private readonly earnVaultService: EarnVaultService) {}

  @ApiOperation({ summary: 'Get current user Earn Vault summary' })
  @Get('summary')
  async getSummary(@Req() req: Request & { user?: User }) {
    return this.earnVaultService.getSummary(this.getUserId(req))
  }

  @ApiOperation({ summary: 'Stake balance into an Earn Vault plan' })
  @Throttle({ default: { ttl: 1_000, limit: 3 } })
  @Post('positions')
  async createPosition(
    @Req() req: Request & { user?: User },
    @Body() dto: CreateEarnVaultPositionDto,
    @Headers('idempotency-key') idempotencyKey?: string | string[],
  ) {
    return this.earnVaultService.createPosition(
      this.getUserId(req),
      dto,
      idempotencyKey,
    )
  }

  @ApiOperation({ summary: 'Claim a matured Earn Vault position' })
  @Throttle({ default: { ttl: 1_000, limit: 5 } })
  @Post('positions/:id/claim')
  async claimPosition(
    @Req() req: Request & { user?: User },
    @Param('id') id: string,
  ) {
    return this.earnVaultService.claimPosition(
      this.getUserId(req),
      this.normalisePositionId(id),
    )
  }

  @ApiOperation({ summary: 'Unstake an active Earn Vault position early' })
  @Throttle({ default: { ttl: 1_000, limit: 5 } })
  @Post('positions/:id/unstake')
  async unstakePosition(
    @Req() req: Request & { user?: User },
    @Param('id') id: string,
  ) {
    return this.earnVaultService.unstakePosition(
      this.getUserId(req),
      this.normalisePositionId(id),
    )
  }

  private getUserId(req: Request & { user?: User }): number {
    if (!req.user) {
      throw new UnauthorizedException('User not found')
    }

    return req.user.id
  }

  private normalisePositionId(id: string): string {
    if (!EARN_VAULT_POSITION_ID_PATTERN.test(id)) {
      throw new BadRequestException('Invalid Earn Vault position id')
    }

    return id
  }
}
