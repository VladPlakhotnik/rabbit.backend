import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import * as speakeasy from 'speakeasy'
import { Admin } from '../entities/admin.entity'
import { AdminSecurityEventService } from './admin-security-event.service'

const TOTP_ISSUER = 'Bunny Admin'
const TOTP_WINDOW = 1

@Injectable()
export class AdminTotpService {
  private readonly logger = new Logger(AdminTotpService.name)

  constructor(
    @InjectRepository(Admin)
    private readonly admins: Repository<Admin>,
    private readonly securityEvents: AdminSecurityEventService,
  ) {}

  async beginSetup(
    adminId: string,
  ): Promise<{ secret: string; otpauth_uri: string }> {
    const admin = await this.admins.findOne({ where: { id: adminId } })
    if (!admin) throw new UnauthorizedException('Admin not found')
    if (admin.totp_enabled) {
      throw new BadRequestException(
        'TOTP is already enabled - disable first to re-enroll',
      )
    }

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
    await this.securityEvents.record({
      adminId: admin.id,
      adminEmail: admin.email,
      type: 'totp_setup_started',
    })

    return { secret, otpauth_uri }
  }

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
      admin.totp_secret = null
      await this.admins.save(admin)
      await this.securityEvents.record({
        adminId: admin.id,
        adminEmail: admin.email,
        type: 'totp_setup_failed',
      })
      throw new UnauthorizedException('Invalid TOTP code - restart enrollment')
    }

    admin.totp_enabled = true
    await this.admins.save(admin)
    await this.securityEvents.record({
      adminId: admin.id,
      adminEmail: admin.email,
      type: 'totp_enabled',
    })
    this.logger.log(`TOTP enabled for admin ${adminId}`)
  }

  async disable(adminId: string, code: string): Promise<void> {
    const admin = await this.admins.findOne({ where: { id: adminId } })
    if (!admin) throw new UnauthorizedException('Admin not found')
    if (!admin.totp_enabled || !admin.totp_secret) {
      throw new BadRequestException('TOTP is not enabled')
    }

    if (!this.verify(admin.totp_secret, code)) {
      await this.securityEvents.record({
        adminId: admin.id,
        adminEmail: admin.email,
        type: 'totp_disable_failed',
      })
      throw new UnauthorizedException('Invalid TOTP code')
    }

    admin.totp_secret = null
    admin.totp_enabled = false
    await this.admins.save(admin)
    await this.securityEvents.record({
      adminId: admin.id,
      adminEmail: admin.email,
      type: 'totp_disabled',
    })
    this.logger.log(`TOTP disabled for admin ${adminId}`)
  }

  verifyForLogin(admin: Admin, code: string | undefined): boolean {
    if (!admin.totp_enabled || !admin.totp_secret) return true
    if (!code) return false
    return this.verify(admin.totp_secret, code)
  }

  private verify(secret: string, code: string): boolean {
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
