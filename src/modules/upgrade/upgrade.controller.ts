import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common'
import { Request } from 'express'
import { AuthGuard } from '@nestjs/passport'
import { ThrottlerGuard } from '@nestjs/throttler'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { UpgradeService } from './upgrade.service'
import { UpgradeDto } from './dto/upgrade.dto'
import { UpgradeResultDto } from './dto/upgrade-result.dto'
import { UpgradeLimitsDto } from './dto/upgrade-limits.dto'
import { User } from '../users/user.entity'

@ApiTags('upgrade')
@Controller('upgrade')
@UseGuards(ThrottlerGuard)
export class UpgradeController {
  constructor(private readonly upgradeService: UpgradeService) {}

  @ApiOperation({
    summary: 'Get upgrade limits (chance/amount/materials bounds)',
  })
  @ApiResponse({
    status: 200,
    description: 'Limits enforced by the upgrade service',
    type: UpgradeLimitsDto,
  })
  @Get('limits')
  getLimits(): UpgradeLimitsDto {
    return this.upgradeService.getLimits()
  }

  @ApiOperation({ summary: 'Perform skin upgrade' })
  @ApiResponse({
    status: 200,
    description: 'Upgrade attempt completed (win or loss)',
    type: UpgradeResultDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Validation failure or business rule violation (e.g. insufficient balance, downgrade attempt, target already owned, target/material with invalid price)',
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT' })
  @ApiResponse({
    status: 404,
    description: 'Target skin or one of the inventory materials not found',
  })
  @ApiResponse({
    status: 429,
    description: 'Too many requests — IP throttle hit (10/minute)',
  })
  @UseGuards(AuthGuard('jwt'))
  @Post()
  async performUpgrade(
    @Body() upgradeDto: UpgradeDto,
    @Req() req: Request & { user?: User },
  ): Promise<UpgradeResultDto> {
    if (!req.user) {
      throw new UnauthorizedException('User not found')
    }

    // Mode-specific required fields are enforced by `@ValidateIf` on the DTO
    // via the global ValidationPipe — no manual branching needed here.
    return this.upgradeService.performUpgrade(req.user.id, upgradeDto)
  }
}
