import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { UserThrottlerGuard } from '../../core/guards/user-throttler.guard'
import { WithdrawService } from './withdraw.service'
import { RequestWithdrawalDto } from './dto/request-withdrawal.dto'

@ApiTags('withdraw')
@Controller('withdraw')
export class WithdrawController {
  constructor(private readonly withdrawService: WithdrawService) {}

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Request Steam Skins withdrawal for one or more inventory items' })
  @UseGuards(AuthGuard('jwt'), UserThrottlerGuard)
  // Tight per-user rate-limit — withdrawing 10 skins is heavy on TM
  // (sequential buy-for calls); back-to-back duplicate requests are
  // almost always a UI-double-click, not legit usage.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('/steam-skins')
  async requestSteamSkinsWithdrawal(
    @Req() req: { user: { id: number } },
    @Body() dto: RequestWithdrawalDto,
  ) {
    const result = await this.withdrawService.requestWithdrawal(
      req.user.id,
      dto.inventory_ids,
      dto.trade_url,
    )
    return result
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'List the current user\'s withdrawals (newest first, last 50)' })
  @UseGuards(AuthGuard('jwt'))
  @Get('/me')
  async getMyWithdrawals(@Req() req: { user: { id: number } }) {
    return this.withdrawService.getUserWithdrawals(req.user.id)
  }
}
