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
// Read endpoint: returns only *active* bonuses (unclaimed AND not yet
// expired). The service-level filter is the single source of truth for
// "what's still valid" — fronts MUST NOT cache stale lists past their
// expiry. The 2-day TTL set in rewards.service keeps the tray small
// in practice (1–2 cards), so no pagination is added.
//
// Claim endpoint: marks a single bonus as claimed. The actual reward
// payout (promo code reveal / case grant / balance credit / item
// drop) is intentionally NOT wired here yet — the service only flips
// `is_claimed=true`. When the per-type payout flows are designed,
// extend `UserBonusService.claimBonus` (or a sibling) without touching
// this controller's contract.

@ApiTags('user-bonuses')
@Controller('user-bonuses')
export class UserBonusController {
  constructor(private readonly userBonusService: UserBonusService) {}

  @ApiOperation({ summary: 'List active (unclaimed, non-expired) bonuses for the current user' })
  @ApiResponse({ status: 200, description: 'Active bonuses, with reward / promoCode joined' })
  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  async listMine(@Req() req: Request) {
    const user = req.user as User
    return this.userBonusService.getUserBonuses(user.id)
  }

  @ApiOperation({
    summary: 'Mark a bonus as claimed',
    description:
      'Flips is_claimed=true on the user_bonus row. Does not yet grant the underlying reward (promo / case / balance / item) — that wiring is added per-type later.',
  })
  @ApiResponse({ status: 200, description: 'Updated bonus row (is_claimed=true)' })
  @ApiResponse({
    status: 400,
    description: 'Bonus not found, already claimed, or expired',
  })
  @UseGuards(AuthGuard('jwt'))
  @Post(':id/claim')
  async claim(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    const user = req.user as User
    try {
      return await this.userBonusService.claimBonus(id, user.id)
    } catch (err) {
      // Service throws a generic Error for the not-found / claimed /
      // expired collapse — re-raise as a clean 400 so the client gets
      // a structured response and toasts something readable instead of
      // a 500.
      throw new BadRequestException(
        err instanceof Error ? err.message : 'Failed to claim bonus',
      )
    }
  }
}
