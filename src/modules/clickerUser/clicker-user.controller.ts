import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
  Request,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { ClickerUserService } from './clicker-user.service'
import { ApiOperation, ApiTags, ApiResponse } from '@nestjs/swagger'
import { AuthGuard } from '@nestjs/passport'
import { Request as ExpressRequest } from 'express'
import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator'
import { Roles } from '../../core/decorators/roles.decorator'
import { RolesGuard } from '../../core/guards/roles.guard'

class AdminGrantPointsDto {
  /**
   * Positive = grant carrots; negative = take away. Floats are
   * truncated. Server clamps the resulting balance at 0 so admin
   * can't drag it negative.
   */
  @IsInt()
  delta!: number

  /** Free-text reason logged into clicker_history for forensics. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string
}

interface RequestWithUser extends Omit<ExpressRequest, 'user'> {
  user: {
    id: number
    steam_id: number
    display_name: string
    role: string
    avatar: string
    opened_cases: number
    upgraded_skins: number
    deposit_amount: number
    withdrawal_amount: number
    rank: string
    balance: number
    profile_url: string
    trade_link: string | null
    created_at: Date
    referral_parent_id: number | null
  }
}

@ApiTags('clicker-users')
@Controller('clicker-users')
export class ClickerUserController {
  constructor(private readonly clickerUserService: ClickerUserService) {}

  @Get()
  @ApiOperation({ summary: 'Get all clicker users' })
  findAll() {
    return this.clickerUserService.findAll()
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Get current user clicker profile' })
  @ApiResponse({
    status: 200,
    description: 'Returns the current user clicker profile (lazy-created on first hit)',
  })
  async getCurrentUserProfile(@Request() req: RequestWithUser) {
    // Lazy creation: the clicker profile no longer exists at registration
    // time. The first time a player opens the clicker tab, this endpoint
    // (or the click bootstrap) materialises the row.
    return this.clickerUserService.findOrCreateByUserId(req.user.id)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get clicker user by ID' })
  findOne(@Param('id') id: number) {
    return this.clickerUserService.findById(id)
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a clicker user by ID' })
  update(@Param('id') id: number, @Body() data: any) {
    return this.clickerUserService.update(id, data)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a clicker user by ID' })
  remove(@Param('id') id: number) {
    return this.clickerUserService.remove(id)
  }

  /**
   * Admin: grant carrots to a target user (or remove with negative
   * delta). Re-anchors their bunny level to whatever the new balance
   * unlocks AND clears the user's Redis hash so the next click
   * bootstrap pulls the fresh PG row instead of returning to the
   * pre-grant cached state.
   *
   * Why an endpoint and not just `UPDATE clicker_users SET points = ...`:
   *   - Manual SQL gets overwritten by the next cron flush because
   *     Redis still holds the old value.
   *   - The bunny level needs to be re-evaluated against the new
   *     points threshold; a bare UPDATE leaves it stale.
   *   - Audit trail goes to clicker_history with the admin's user id,
   *     the delta, the reason, and a clean state_before/state_after.
   *
   * `userId` here is the TARGET user's ID — the admin's identity
   * comes from the JWT (req.user.id), never from the URL.
   */
  @Throttle({ default: { ttl: 1_000, limit: 5 } })
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  @Post(':userId/admin/grant-points')
  @ApiOperation({ summary: 'Admin: grant or remove carrots' })
  @ApiResponse({ status: 200, description: 'New points + level for the target user' })
  adminGrantPoints(
    @Param('userId', ParseIntPipe) targetUserId: number,
    @Body() body: AdminGrantPointsDto,
    @Request() req: RequestWithUser,
  ) {
    const ip =
      (req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
        req.socket?.remoteAddress) ??
      null
    return this.clickerUserService.adminGrantPoints(
      req.user.id,
      targetUserId,
      body.delta,
      body.reason ?? null,
      ip,
    )
  }
}
