import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger'
import { Request } from 'express'
import { COOKIE_NAME, getJwtRefreshSecret } from '../admin.config'
import { CurrentAdmin } from '../decorators/current-admin.decorator'
import { Admin } from '../entities/admin.entity'
import { AdminJwtGuard } from '../guards/admin-jwt.guard'
import { AdminAuthService } from '../services/admin-auth.service'
import { RefreshTokenPayload } from '../types/jwt-payload'

// "Active sessions" surface for the in-app Security page. Each row in
// admin_refresh_tokens with revoked_at IS NULL maps to one device /
// browser the admin is signed in on. Listing them lets the admin
// audit "what's logged in as me right now"; revoking individual rows
// or "all but this one" is the parallel of the Sessions page in
// gmail/github.
//
// Mounted under /admin/auth/sessions so it shares the auth path
// scoping with the existing login/refresh/logout endpoints.
@ApiTags('admin-sessions')
@Controller('admin/auth/sessions')
@UseGuards(ThrottlerGuard, AdminJwtGuard)
@ApiBearerAuth()
export class AdminSessionsController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly jwt: JwtService,
  ) {}

  @Get()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'List active sessions for the current admin' })
  @ApiResponse({
    status: 200,
    description: 'Array of session rows (no secrets)',
  })
  async list(@CurrentAdmin() admin: Admin) {
    return this.auth.listActiveSessions(admin.id)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Revoke one session by id' })
  @ApiResponse({ status: 204, description: 'Revoked' })
  @ApiResponse({ status: 401, description: 'Session not found or not yours' })
  async revoke(
    @CurrentAdmin() admin: Admin,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    await this.auth.revokeSession(admin.id, id)
  }

  @Post('revoke-others')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Revoke every session except the current one. The "current" session is identified by the jti carried in the refresh cookie.',
  })
  @ApiResponse({ status: 200, description: '{ revoked: number }' })
  async revokeOthers(@CurrentAdmin() admin: Admin, @Req() req: Request) {
    // Pull the current jti from the refresh cookie — we keep the
    // current session alive by skipping the row whose bcrypt-hashed
    // jti matches. If the cookie is missing (the admin somehow has a
    // valid access token but no refresh) we revoke all rows including
    // the present access — they'll get logged out on next 401.
    const refreshToken = (req.cookies as Record<string, string> | undefined)?.[
      COOKIE_NAME
    ]
    let currentJti = ''
    if (refreshToken) {
      try {
        const payload = await this.jwt.verifyAsync<RefreshTokenPayload>(
          refreshToken,
          {
            secret: getJwtRefreshSecret(),
          },
        )
        if (payload.type === 'refresh') currentJti = payload.jti
      } catch {
        // bad cookie — fall through to revoke-all behaviour
      }
    }
    const revoked = await this.auth.revokeOtherSessions(admin.id, currentJti)
    return { revoked }
  }
}
