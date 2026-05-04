import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '@nestjs/passport'
import { Request as ExpressRequest } from 'express'
import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator'
import { ClickerUserService } from './clicker-user.service'
import { ListClickerUsersQueryDto } from './dto/list-clicker-users.dto'
import { Admin } from '../admin/entities/admin.entity'
import { AdminJwtGuard } from '../admin/guards/admin-jwt.guard'
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard'
import { AdminRoles } from '../admin/decorators/admin-roles.decorator'
import { AdminRole } from '../admin/types/admin-role.enum'

class GrantPointsDto {
  /**
   * Positive = grant carrots; negative = take away. Floats are
   * truncated. Server clamps the resulting balance at 0 so the issuer
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

// `me` endpoint runs under the player-side OAuth JWT, so it expects
// req.user to be a game User. Other endpoints below run under the
// admin-panel JWT (AdminJwtGuard) — req.user is then an Admin row.
interface RequestWithPlayer extends Omit<ExpressRequest, 'user'> {
  user: {
    id: number
    role: string
  }
}

interface RequestWithAdmin extends Omit<ExpressRequest, 'user'> {
  user: Admin
}

@ApiTags('clicker-users')
@Controller('clicker-users')
export class ClickerUserController {
  constructor(private readonly clickerUserService: ClickerUserService) {}

  // ─── Player-facing ───────────────────────────────────────────────

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Get current user clicker profile' })
  @ApiResponse({
    status: 200,
    description: 'Returns the current user clicker profile (lazy-created on first hit)',
  })
  async getCurrentUserProfile(@Request() req: RequestWithPlayer) {
    // Lazy creation: the clicker profile no longer exists at registration
    // time. The first time a player opens the clicker tab, this endpoint
    // (or the click bootstrap) materialises the row.
    return this.clickerUserService.findOrCreateByUserId(req.user.id)
  }

  // ─── Admin panel ─────────────────────────────────────────────────
  //
  // Everything below is for the admin panel and runs under
  // AdminJwtGuard + AdminRolesGuard. Read endpoints are open to all
  // staff roles (including VIEWER); the carrot-mutating action is
  // restricted to SUPER_ADMIN / ADMIN.
  //
  // The legacy generic `PUT /:id` (mass-assignment via Body() any)
  // and `DELETE /:id` were removed — see the hand-off note at the
  // bottom of this file for what targeted actions still need to be
  // built to fully replace them.

  @Get()
  @UseGuards(AdminJwtGuard, AdminRolesGuard)
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.MANAGER, AdminRole.VIEWER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List clicker users (admin, paginated)' })
  @ApiResponse({
    status: 200,
    description: '{ data: ClickerUser[], total, page, limit }',
  })
  findAll(@Query() query: ListClickerUsersQueryDto) {
    return this.clickerUserService.findAll(query.page ?? 1, query.limit ?? 20)
  }

  @Get(':id')
  @UseGuards(AdminJwtGuard, AdminRolesGuard)
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.MANAGER, AdminRole.VIEWER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get clicker user by ID (admin)' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.clickerUserService.findById(id)
  }

  /**
   * Grant carrots to a target user (or remove with negative delta).
   * Re-anchors their bunny level to whatever the new balance unlocks
   * AND clears the user's Redis hash so the next click bootstrap
   * pulls the fresh PG row instead of returning to the pre-grant
   * cached state.
   *
   * Why an endpoint and not just `UPDATE clicker_users SET points = ...`:
   *   - Manual SQL gets overwritten by the next cron flush because
   *     Redis still holds the old value.
   *   - The bunny level needs to be re-evaluated against the new
   *     points threshold; a bare UPDATE leaves it stale.
   *   - Audit trail goes to clicker_history with the issuer admin id,
   *     the delta, the reason, and a clean state_before/state_after.
   *
   * `userId` here is the TARGET player — the issuer's identity comes
   * from the admin JWT (req.user.id), never from the URL.
   */
  @Throttle({ default: { ttl: 1_000, limit: 5 } })
  @UseGuards(AdminJwtGuard, AdminRolesGuard)
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiBearerAuth()
  @Post(':userId/grant-points')
  @ApiOperation({ summary: 'Grant or remove carrots (admin only)' })
  @ApiResponse({ status: 200, description: 'New points + level for the target user' })
  grantPoints(
    @Param('userId', ParseIntPipe) targetUserId: number,
    @Body() body: GrantPointsDto,
    @Request() req: RequestWithAdmin,
  ) {
    const ip =
      (req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
        req.socket?.remoteAddress) ??
      null
    return this.clickerUserService.grantPoints(
      req.user.id,
      targetUserId,
      body.delta,
      body.reason ?? null,
      ip,
    )
  }
}

// ─── Hand-off: still TODO (different agent / future PR) ──────────────
//
// The generic `PUT /clicker-users/:id` and `DELETE /clicker-users/:id`
// were removed in this pass because they were:
//   - unauthenticated (any caller could rewrite/delete any profile),
//   - typed as `Body() data: any` → mass assignment on every column
//     including `user_id`, `points`, `total_points`, `level_id`,
//   - DELETE additionally orphans rows in clicker_history, boost
//     ownership, case-open audit, etc.
//
// To fully replace what they did, build the following targeted admin
// endpoints. Keep each one role-gated with AdminJwtGuard +
// AdminRolesGuard, validated through a strict whitelist DTO, and
// followed by `flushService.flushUser(userId)` BEFORE the write and
// `redisService.clearUser(userId)` AFTER — otherwise the next cron
// flush silently overwrites the admin's edit with the cached value.
//
//   1. PATCH /clicker-users/:id/balance
//        body: { points: int>=0, total_points?: int>=0, reason?: string }
//        roles: SUPER_ADMIN, ADMIN
//        audit: clicker_history (action='admin_set_balance')
//        Note: `grantPoints` already covers delta-style edits with
//        full audit. Only build this if there's a real need to set
//        an absolute balance instead of applying a delta.
//
//   2. PATCH /clicker-users/:id/levels
//        body: { level?: int, click_level?: int, energy_level?: int,
//                auto_clicker_level?: int|null,
//                crit_click_level?: int|null }
//        Validate each id exists in its catalog table. Keep the
//        `level` monotonic guard from grantPoints (never demote).
//        roles: SUPER_ADMIN, ADMIN
//        audit: clicker_history (action='admin_set_levels')
//
//   3. PATCH /clicker-users/:id/energy
//        body: { energy_amount: int>=0 }
//        Cap at user's `energy_level.energy_amount`.
//        roles: SUPER_ADMIN, ADMIN
//
//   4. POST /clicker-users/:id/disable  (replaces DELETE)
//        Soft-disable — add an `is_active`/`disabled_at` column to
//        clicker_users (migration), set it true here, gateway/click
//        endpoints reject if disabled. Doesn't break FKs.
//        roles: SUPER_ADMIN
//        audit: clicker_history (action='admin_disable')
//
//   5. POST /clicker-users/:id/enable
//        Inverse of (4). roles: SUPER_ADMIN
//
// What is NOT needed:
//   - A generic `PUT /:id` with a partial DTO. The whole point of the
//     security fix was to drop mass assignment; bringing it back
//     under a different name reintroduces the foot-gun.
//   - A real `DELETE /:id`. Hard delete corrupts audit trails and
//     cross-table FKs. If a profile must truly disappear, write a
//     dedicated migration script.
//
// Frontend (rabbit-admin) currently calls only `GET /clicker-users` and
// `POST /clicker-users/:userId/grant-points` — anything above will need
// matching `entities/clicker-user/api` mutations + a UI surface.
