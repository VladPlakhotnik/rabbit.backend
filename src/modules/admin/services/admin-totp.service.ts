import { Injectable, BadRequestException, UnauthorizedException, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import * as speakeasy from 'speakeasy'
import { Admin } from '../entities/admin.entity'

// TOTP issuer label that shows up inside Authenticator apps (Google
// Authenticator, 1Password, Authy, etc). Keep it human-readable —
// users glance at it to find the right code among 20+ entries.
const TOTP_ISSUER = 'Rabbit Admin'

// 30-second time step (default) with ±1 step tolerance. Means a code
// is accepted for ~90 s total — enough to cover clock skew and the
// user's fumbling between reading the code and submitting, without
// opening the replay window further. window=1 covers prev+current+next.
const TOTP_WINDOW = 1

/**
 * TOTP / 2FA orchestration for admin accounts.
 *
 * Flow:
 *  1. Admin hits /admin/auth/2fa/setup → server generates a fresh
 *     base32 secret, persists it on the row WITHOUT enabling 2FA yet
 *     (totp_enabled stays false until first verify), returns the
 *     secret + an otpauth:// URI for QR rendering on the client.
 *  2. Admin scans the QR in their authenticator, enters the 6-digit
 *     code, hits /admin/auth/2fa/verify. On match → totp_enabled = true.
 *     On mismatch → totp_secret cleared, setup must restart.
 *  3. Login flow checks totp_enabled; if true, the request body must
 *     also carry `totp_code` and it must verify against the stored
 *     secret.
 *  4. /admin/auth/2fa/disable wipes secret + flag in one shot. Always
 *     requires a current TOTP code to prevent a stolen-session attacker
 *     from disabling 2FA silently.
 */
@Injectable()
export class AdminTotpService {
  private readonly logger = new Logger(AdminTotpService.name)

  constructor(
    @InjectRepository(Admin)
    private readonly admins: Repository<Admin>,
  ) {}

  // Returns the otpauth URI + raw secret. Frontend renders the URI as
  // a QR; the raw secret is shown alongside as a fallback for users on
  // a single device (no second device to scan from).
  async beginSetup(adminId: string): Promise<{ secret: string; otpauth_uri: string }> {
    const admin = await this.admins.findOne({ where: { id: adminId } })
    if (!admin) throw new UnauthorizedException('Admin not found')
    if (admin.totp_enabled) {
      throw new BadRequestException('TOTP is already enabled — disable first to re-enroll')
    }

    // 20 bytes = 160 bits, the RFC 6238 reference implementation length.
    // base32 encoding turns it into a 32-character string the user can
    // type by hand if their authenticator can't scan a QR.
    const generated = speakeasy.generateSecret({
      length: 20,
      name: `${TOTP_ISSUER}:${admin.email}`,
      issuer: TOTP_ISSUER,
    })

    const secret = generated.base32
    const otpauth_uri = generated.otpauth_url ?? ''

    admin.totp_secret = secret
    admin.totp_enabled = false
    await this.admins.save(admin)

    return { secret, otpauth_uri }
  }

  // Confirms enrollment by verifying the first code the user types.
  // On success: flip totp_enabled to true. On failure: keep totp_enabled
  // false and clear the half-set secret so retries start clean.
  async confirmSetup(adminId: string, code: string): Promise<void> {
    const admin = await this.admins.findOne({ where: { id: adminId } })
    if (!admin) throw new UnauthorizedException('Admin not found')
    if (admin.totp_enabled) {
      throw new BadRequestException('TOTP is already enabled')
    }
    if (!admin.totp_secret) {
      throw new BadRequestException('Run /2fa/setup first')
    }

    if (!this.verify(admin.totp_secret, code)) {
      // Hard reset: a valid code is required within the same setup
      // session. If the user fat-fingers it, they re-run setup —
      // cheaper than tracking attempts here.
      admin.totp_secret = null
      await this.admins.save(admin)
      throw new UnauthorizedException('Invalid TOTP code — restart enrollment')
    }

    admin.totp_enabled = true
    await this.admins.save(admin)
    this.logger.log(`TOTP enabled for admin ${adminId}`)
  }

  // Disables 2FA. Requires a fresh code to defeat session-hijack
  // attempts to weaken the account.
  async disable(adminId: string, code: string): Promise<void> {
    const admin = await this.admins.findOne({ where: { id: adminId } })
    if (!admin) throw new UnauthorizedException('Admin not found')
    if (!admin.totp_enabled || !admin.totp_secret) {
      throw new BadRequestException('TOTP is not enabled')
    }

    if (!this.verify(admin.totp_secret, code)) {
      throw new UnauthorizedException('Invalid TOTP code')
    }

    admin.totp_secret = null
    admin.totp_enabled = false
    await this.admins.save(admin)
    this.logger.log(`TOTP disabled for admin ${adminId}`)
  }

  // Used during login. Returns boolean — caller decides what to do.
  verifyForLogin(admin: Admin, code: string | undefined): boolean {
    if (!admin.totp_enabled || !admin.totp_secret) return true // not gated
    if (!code) return false
    return this.verify(admin.totp_secret, code)
  }

  private verify(secret: string, code: string): boolean {
    // speakeasy.totp.verify returns false on malformed inputs rather
    // than throwing — but wrap defensively just in case a future
    // version changes that contract.
    try {
      return speakeasy.totp.verify({
        secret,
        encoding: 'base32',
        token: code,
        window: TOTP_WINDOW,
      })
    } catch {
      return false
    }
  }
}
