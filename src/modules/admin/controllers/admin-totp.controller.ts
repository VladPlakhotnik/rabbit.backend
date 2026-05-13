import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger'
import { CurrentAdmin } from '../decorators/current-admin.decorator'
import { TotpCodeDto } from '../dto/totp.dto'
import { Admin } from '../entities/admin.entity'
import { AdminJwtGuard } from '../guards/admin-jwt.guard'
import { AdminTotpService } from '../services/admin-totp.service'

// 2FA management for the currently-authenticated admin. Login-time
// verification lives in AdminAuthService.login (see TOTP_REQUIRED
// flow there). This controller is for the in-app "Security" page.
//
// All endpoints require an authenticated admin — the user is reading
// /editing their own 2FA state, never someone else's. There's no
// admin-of-admin "disable 2FA for X" surface here, by design — that
// would defeat the purpose. Recovery for a lost authenticator goes
// through SUPER_ADMIN deleting + re-creating the row.
@ApiTags('admin-2fa')
@Controller('admin/auth/2fa')
@UseGuards(ThrottlerGuard, AdminJwtGuard)
@ApiBearerAuth()
export class AdminTotpController {
  constructor(private readonly totp: AdminTotpService) {}

  // Begin enrollment. Returns the secret (in case the user can't scan)
  // and an otpauth:// URI ready to feed into a QR renderer. Idempotent
  // only while totp_enabled stays false — re-running just re-rolls the
  // pending secret.
  @Post('setup')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Begin TOTP enrollment, returns secret + otpauth URI',
  })
  @ApiResponse({ status: 200, description: '{ secret, otpauth_uri }' })
  @ApiResponse({ status: 400, description: 'TOTP is already enabled' })
  async setup(@CurrentAdmin() admin: Admin) {
    return this.totp.beginSetup(admin.id)
  }

  // Confirms enrollment by validating the first 6-digit code. Flips
  // totp_enabled on success. From this point on every login for this
  // admin needs a code.
  @Post('verify')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Confirm TOTP enrollment with first code' })
  @ApiResponse({ status: 204, description: 'Enabled' })
  @ApiResponse({
    status: 401,
    description: 'Invalid code — restart enrollment',
  })
  async verify(@CurrentAdmin() admin: Admin, @Body() dto: TotpCodeDto) {
    await this.totp.confirmSetup(admin.id, dto.code)
  }

  // Turns 2FA off. Requires a current code so a stolen access token
  // alone can't weaken the account.
  @Post('disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Disable TOTP (requires current code)' })
  @ApiResponse({ status: 204, description: 'Disabled' })
  @ApiResponse({ status: 401, description: 'Invalid code' })
  async disable(@CurrentAdmin() admin: Admin, @Body() dto: TotpCodeDto) {
    await this.totp.disable(admin.id, dto.code)
  }
}
