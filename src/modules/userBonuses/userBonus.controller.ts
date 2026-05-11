import {
  Controller,
  Get,
  Post,
  Param,
  Req,
  UseGuards,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { Request } from 'express'
import { User } from '../users/user.entity'
import { UserBonusService } from './userBonus.service'

// HTTP surface for bonus cards stored in `user_bonuses`.
//
// Read endpoint: returns only active bonuses (unclaimed AND not yet
// expired). The service-level filter is the single source of truth for
// what's still valid; frontends must not cache stale lists past expiry.
//
// Claim endpoint: marks a single bonus as claimed and delegates the
// concrete payout to `UserBonusService.claimBonus`. The service owns
// the transaction and per-reward logic (balance, carrots, case, item,
// promo code / respin).

@ApiTags('user-bonuses')
@Controller('user-bonuses')
export class UserBonusController {
  constructor(private readonly userBonusService: UserBonusService) {}

  @ApiOperation({
    summary: 'List active (unclaimed, non-expired) bonuses for the current user',
  })
  @ApiResponse({
    status: 200,
    description: 'Active bonuses, with reward / promoCode joined',
  })
  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  async listMine(@Req() req: Request) {
    const user = req.user as User
    return this.userBonusService.getUserBonuses(user.id)
  }

  @ApiOperation({
    summary: 'Claim a bonus and apply its payout',
    description:
      'Locks the user_bonus row, marks it claimed and applies the configured payout transactionally.',
  })
  @ApiResponse({
    status: 200,
    description: 'Updated bonus row with payout applied',
  })
  @ApiResponse({
    status: 400,
    description: 'Bonus not found, already claimed, or expired',
  })
  @UseGuards(AuthGuard('jwt'))
  @Post(':id/claim')
  async claim(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const user = req.user as User
    try {
      return await this.userBonusService.claimBonus(id, user.id)
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : 'Failed to claim bonus',
      )
    }
  }
}
