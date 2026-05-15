import { randomUUID } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { InjectRepository } from '@nestjs/typeorm'
import * as bcrypt from 'bcrypt'
import { IsNull, LessThanOrEqual, Repository } from 'typeorm'
import {
  ACCESS_TOKEN_TTL_SECONDS,
  BCRYPT_ROUNDS,
  LOCKOUT_DURATION_MS,
  MAX_FAILED_LOGIN_ATTEMPTS,
  REFRESH_TOKEN_TTL_SECONDS,
  getInitialAdminEmail,
  getInitialAdminPassword,
  getJwtAccessSecret,
  getJwtRefreshSecret,
} from '../admin.config'
import { LoginDto } from '../dto/login.dto'
import { AdminRefreshToken } from '../entities/admin-refresh-token.entity'
import { Admin, SafeAdmin } from '../entities/admin.entity'
import { AdminRole } from '../types/admin-role.enum'
import {
  AccessTokenPayload,
  AdminJwtPayload,
  RefreshTokenPayload,
} from '../types/jwt-payload'
import { AdminSecurityEventService } from './admin-security-event.service'
import { AdminTotpService } from './admin-totp.service'

// Special-shaped 401 returned when the account has TOTP enabled and
// the client didn't include a code yet. Frontend keys on `code:
// 'TOTP_REQUIRED'` to render the second-step UI without re-entering
// the password. Kept distinct from generic "Invalid credentials" so
// the user gets clear feedback.
const TOTP_REQUIRED_RESPONSE = {
  message: 'TOTP code required',
  code: 'TOTP_REQUIRED',
}

interface LoginResult {
  admin: SafeAdmin
  access_token: string
  refresh_token: string
  refresh_expires_at: Date
}

@Injectable()
export class AdminAuthService implements OnModuleInit {
  private readonly logger = new Logger(AdminAuthService.name)

  constructor(
    @InjectRepository(Admin)
    private readonly admins: Repository<Admin>,
    @InjectRepository(AdminRefreshToken)
    private readonly refreshTokens: Repository<AdminRefreshToken>,
    private readonly jwt: JwtService,
    private readonly totp: AdminTotpService,
    private readonly securityEvents: AdminSecurityEventService,
  ) {}

  // ─── Bootstrap ─────────────────────────────────────────────────

  // On the first start of a fresh DB, seed the initial super_admin
  // from env vars. No-op if any admin already exists. Once seeded,
  // remove the env vars from your deploy config — they're a one-shot.
  async onModuleInit(): Promise<void> {
    const email = getInitialAdminEmail()
    const password = getInitialAdminPassword()
    if (!email || !password) return

    const existingCount = await this.admins.count()
    if (existingCount > 0) return

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS)
    const seed = this.admins.create({
      email: email.toLowerCase(),
      password_hash: hash,
      first_name: 'Initial',
      last_name: 'Admin',
      role: AdminRole.SUPER_ADMIN,
      is_active: true,
    })
    await this.admins.save(seed)
    this.logger.warn(
      `Bootstrapped initial super_admin <${email}>. Remove ADMIN_INITIAL_EMAIL / ADMIN_INITIAL_PASSWORD from env now.`,
    )
  }

  // ─── Login ─────────────────────────────────────────────────────

  async login(
    dto: LoginDto,
    ip: string | null,
    userAgent: string | null,
  ): Promise<LoginResult> {
    const email = dto.email.toLowerCase().trim()

    // We deliberately use the SAME error message for "no such email"
    // and "wrong password" — and bcrypt-compare a dummy hash when no
    // user found — so attackers can't enumerate valid emails by
    // measuring response times.
    const admin = await this.admins.findOne({ where: { email } })

    if (!admin) {
      // Constant-time-ish — burn the same hash budget the legit path
      // would have spent. Doesn't have to be exact, just non-trivial.
      await bcrypt.compare(
        dto.password,
        '$2b$12$invalidsalt.................................',
      )
      await this.securityEvents.record({
        adminEmail: email,
        type: 'login_failed',
        ip,
        userAgent,
        metadata: { reason: 'unknown_email' },
      })
      throw new UnauthorizedException('Invalid credentials')
    }

    // Locked? Even with correct password, refuse.
    if (admin.locked_until && admin.locked_until > new Date()) {
      await this.securityEvents.record({
        adminId: admin.id,
        adminEmail: admin.email,
        type: 'login_blocked',
        ip,
        userAgent,
        metadata: { reason: 'locked', locked_until: admin.locked_until },
      })
      throw new ForbiddenException(
        `Account temporarily locked. Try again at ${admin.locked_until.toISOString()}`,
      )
    }

    if (!admin.is_active) {
      await this.securityEvents.record({
        adminId: admin.id,
        adminEmail: admin.email,
        type: 'login_blocked',
        ip,
        userAgent,
        metadata: { reason: 'disabled' },
      })
      throw new ForbiddenException('Account disabled')
    }

    const passwordOk = await bcrypt.compare(dto.password, admin.password_hash)

    if (!passwordOk) {
      const locked = await this.recordFailedAttempt(admin)
      await this.securityEvents.record({
        adminId: admin.id,
        adminEmail: admin.email,
        type: 'login_failed',
        ip,
        userAgent,
        metadata: { reason: 'password' },
      })
      if (locked) {
        await this.securityEvents.record({
          adminId: admin.id,
          adminEmail: admin.email,
          type: 'account_locked',
          ip,
          userAgent,
          metadata: { locked_until: admin.locked_until },
        })
      }
      throw new UnauthorizedException('Invalid credentials')
    }

    // 2FA gate. If the account has TOTP enabled, the password alone is
    // not enough — also need a fresh code. We return a distinguishable
    // 401 so the frontend can prompt for the code without making the
    // user re-enter their password.
    if (admin.totp_enabled) {
      if (!dto.totp_code) {
        // Don't burn a failed-attempt slot here — missing code is not
        // a wrong-credentials event, it's a "you need a second factor"
        // event. Bumping the counter would lock out users who simply
        // forgot to type their code.
        throw new UnauthorizedException(TOTP_REQUIRED_RESPONSE)
      }
      if (!this.totp.verifyForLogin(admin, dto.totp_code)) {
        // Wrong code DOES count toward the lockout — it's an actual
        // failed credential attempt at this point.
        const locked = await this.recordFailedAttempt(admin)
        await this.securityEvents.record({
          adminId: admin.id,
          adminEmail: admin.email,
          type: 'login_failed',
          ip,
          userAgent,
          metadata: { reason: 'totp' },
        })
        if (locked) {
          await this.securityEvents.record({
            adminId: admin.id,
            adminEmail: admin.email,
            type: 'account_locked',
            ip,
            userAgent,
            metadata: { locked_until: admin.locked_until },
          })
        }
        throw new UnauthorizedException('Invalid TOTP code')
      }
    }

    // Reset failed-attempts counter on successful login.
    admin.failed_login_attempts = 0
    admin.locked_until = null
    admin.last_login_at = new Date()
    admin.last_login_ip = ip
    await this.admins.save(admin)

    const tokens = await this.issueTokens(admin, ip, userAgent)
    await this.securityEvents.record({
      adminId: admin.id,
      adminEmail: admin.email,
      type: 'login_success',
      ip,
      userAgent,
    })
    return { admin: admin.toSafeJson(), ...tokens }
  }

  private async recordFailedAttempt(admin: Admin): Promise<boolean> {
    admin.failed_login_attempts += 1
    let locked = false
    if (admin.failed_login_attempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
      admin.locked_until = new Date(Date.now() + LOCKOUT_DURATION_MS)
      locked = true
      this.logger.warn(
        `Admin <${admin.email}> locked until ${admin.locked_until.toISOString()} after ${admin.failed_login_attempts} failed attempts`,
      )
    }
    await this.admins.save(admin)
    return locked
  }

  // ─── Refresh ───────────────────────────────────────────────────

  async refresh(
    presentedToken: string,
    ip: string | null,
    userAgent: string | null,
  ): Promise<LoginResult> {
    let payload: RefreshTokenPayload
    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(
        presentedToken,
        {
          secret: getJwtRefreshSecret(),
        },
      )
    } catch {
      throw new UnauthorizedException('Invalid refresh token')
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Wrong token type')
    }

    // Find the stored hash row by jti via bcrypt-comparing — we don't
    // store jti plaintext (stored as bcrypt hash). Pull all currently
    // valid tokens for the user and compare each. Costs O(active tokens
    // for this user) bcrypt-compares — typically <5, capped by app
    // logic.
    const candidateRows = await this.refreshTokens.find({
      where: {
        admin_id: payload.sub,
        revoked_at: IsNull(),
      },
    })

    let row: AdminRefreshToken | null = null
    for (const r of candidateRows) {
      if (await bcrypt.compare(payload.jti, r.token_hash)) {
        row = r
        break
      }
    }

    if (!row) {
      // No matching row at all — token was either never issued, was
      // already expired and cleaned up, or someone forged it.
      throw new UnauthorizedException('Refresh token not recognised')
    }

    // Reuse-attack signal: presenter has a token that was already
    // consumed. Either an attacker stole the original AND the
    // legitimate user already used it, or vice versa. Either way,
    // we can't tell which is which — kill EVERY session for safety.
    if (row.used_at) {
      this.logger.warn(
        `Refresh-token reuse detected for admin ${payload.sub} — revoking all sessions`,
      )
      await this.revokeAllForAdmin(payload.sub)
      await this.securityEvents.record({
        adminId: payload.sub,
        type: 'refresh_reuse_detected',
        ip,
        userAgent,
      })
      throw new UnauthorizedException(
        'Refresh token reuse detected — all sessions revoked',
      )
    }

    if (row.expires_at <= new Date()) {
      throw new UnauthorizedException('Refresh token expired')
    }

    // Mark as used (one-shot rotation), issue new pair.
    row.used_at = new Date()
    await this.refreshTokens.save(row)

    const admin = await this.admins.findOne({ where: { id: payload.sub } })
    if (!admin || !admin.is_active) {
      throw new UnauthorizedException('Admin no longer active')
    }

    const tokens = await this.issueTokens(admin, ip, userAgent)
    return { admin: admin.toSafeJson(), ...tokens }
  }

  // ─── Logout ────────────────────────────────────────────────────

  // Best-effort revoke of the presented refresh. We don't fail if it
  // can't be decoded — logout should always succeed from the client's
  // perspective so they can wipe local state and move on.
  async logout(presentedToken: string | null): Promise<void> {
    if (!presentedToken) return

    let payload: RefreshTokenPayload
    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(
        presentedToken,
        {
          secret: getJwtRefreshSecret(),
        },
      )
    } catch {
      return
    }

    if (payload.type !== 'refresh') return

    const candidateRows = await this.refreshTokens.find({
      where: { admin_id: payload.sub, revoked_at: IsNull() },
    })
    for (const r of candidateRows) {
      if (await bcrypt.compare(payload.jti, r.token_hash)) {
        r.revoked_at = new Date()
        await this.refreshTokens.save(r)
        return
      }
    }
  }

  async revokeAllForAdmin(adminId: string): Promise<void> {
    await this.refreshTokens.update(
      { admin_id: adminId, revoked_at: IsNull() },
      { revoked_at: new Date() },
    )
  }

  // ─── Active sessions surface ────────────────────────────────────
  //
  // Lists currently-active refresh rows for an admin. "Active" means
  // not revoked and not expired — the `used_at` field is irrelevant
  // here (a token row used N seconds ago and rotated just spawned a
  // new active row that took its place). Each row maps 1:1 to a
  // browser/device session.
  //
  // We never return `token_hash` — only the metadata the user needs to
  // recognise their own devices.

  async listActiveSessions(adminId: string): Promise<
    Array<{
      id: string
      ip_address: string | null
      user_agent: string | null
      created_at: Date
      expires_at: Date
    }>
  > {
    const rows = await this.refreshTokens.find({
      where: { admin_id: adminId, revoked_at: IsNull() },
      order: { created_at: 'DESC' },
    })
    const now = new Date()
    return rows
      .filter(r => r.expires_at > now && !r.used_at)
      .map(r => ({
        id: r.id,
        ip_address: r.ip_address,
        user_agent: r.user_agent,
        created_at: r.created_at,
        expires_at: r.expires_at,
      }))
  }

  // Revoke a specific session row by id, scoped to the calling admin
  // so admin A can never revoke admin B's sessions through this path.
  async revokeSession(adminId: string, sessionId: string): Promise<void> {
    const row = await this.refreshTokens.findOne({
      where: { id: sessionId, admin_id: adminId },
    })
    if (!row) {
      throw new UnauthorizedException('Session not found')
    }
    if (row.revoked_at) return // already revoked — no-op
    row.revoked_at = new Date()
    await this.refreshTokens.save(row)
    await this.securityEvents.record({
      adminId,
      type: 'session_revoked',
      metadata: { session_id: sessionId },
    })
  }

  // Revoke every active session except the one carrying `currentJti`.
  // Used by the "Sign out other devices" button — caller passes the
  // jti from the currently-presented refresh token (decoded from the
  // user_rt cookie / Authorization chain) so we don't kill them too.
  async revokeOtherSessions(
    adminId: string,
    currentJti: string,
  ): Promise<number> {
    const rows = await this.refreshTokens.find({
      where: { admin_id: adminId, revoked_at: IsNull() },
    })
    let revokedCount = 0
    for (const r of rows) {
      // Skip the current session — bcrypt-compare its jti to spot the
      // hash row we should leave alone.
      if (await bcrypt.compare(currentJti, r.token_hash)) continue
      r.revoked_at = new Date()
      await this.refreshTokens.save(r)
      revokedCount++
    }
    await this.securityEvents.record({
      adminId,
      type: 'sessions_revoked',
      metadata: { revoked_count: revokedCount },
    })
    return revokedCount
  }

  // ─── Token issuance ────────────────────────────────────────────

  async changeOwnPassword(
    admin: Admin,
    currentPassword: string,
    newPassword: string,
    currentJti: string | null,
    ip: string | null,
    userAgent: string | null,
  ): Promise<void> {
    const currentOk = await bcrypt.compare(currentPassword, admin.password_hash)
    if (!currentOk) {
      await this.securityEvents.record({
        adminId: admin.id,
        adminEmail: admin.email,
        type: 'password_change_failed',
        ip,
        userAgent,
        metadata: { reason: 'current_password' },
      })
      throw new UnauthorizedException('Invalid current password')
    }

    if (await bcrypt.compare(newPassword, admin.password_hash)) {
      throw new BadRequestException('New password must be different')
    }

    admin.password_hash = await this.hashPassword(newPassword)
    await this.admins.save(admin)
    await this.revokeAllExceptCurrent(admin.id, currentJti)
    await this.securityEvents.record({
      adminId: admin.id,
      adminEmail: admin.email,
      type: 'password_changed',
      ip,
      userAgent,
    })
  }

  private async issueTokens(
    admin: Admin,
    ip: string | null,
    userAgent: string | null,
  ): Promise<{
    access_token: string
    refresh_token: string
    refresh_expires_at: Date
  }> {
    const accessPayload: AccessTokenPayload = {
      sub: admin.id,
      role: admin.role,
      type: 'access',
    }
    const accessToken = await this.jwt.signAsync(accessPayload, {
      secret: getJwtAccessSecret(),
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    })

    const jti = randomUUID()
    const refreshPayload: RefreshTokenPayload = {
      sub: admin.id,
      type: 'refresh',
      jti,
    }
    const refreshToken = await this.jwt.signAsync(refreshPayload, {
      secret: getJwtRefreshSecret(),
      expiresIn: REFRESH_TOKEN_TTL_SECONDS,
    })

    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000)
    const tokenHash = await bcrypt.hash(jti, BCRYPT_ROUNDS)

    const row = this.refreshTokens.create({
      admin_id: admin.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
      ip_address: ip,
      user_agent: userAgent,
    })
    await this.refreshTokens.save(row)

    // Best-effort housekeeping — drop fully expired rows for this
    // user. Async, fire-and-forget. If it fails we don't care.
    this.refreshTokens
      .delete({ admin_id: admin.id, expires_at: LessThanOrEqual(new Date()) })
      .catch(() => {
        /* ignore */
      })

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      refresh_expires_at: expiresAt,
    }
  }

  // ─── For the JWT strategy ──────────────────────────────────────

  // Called by AdminJwtStrategy.validate(). Returns the live admin so
  // the strategy attaches it to req.user and downstream guards can
  // check role / active status against the current DB row.
  async findActiveAdmin(payload: AdminJwtPayload): Promise<Admin> {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Wrong token type for this endpoint')
    }
    const admin = await this.admins.findOne({ where: { id: payload.sub } })
    if (!admin) throw new UnauthorizedException('Admin not found')
    if (!admin.is_active) throw new UnauthorizedException('Admin disabled')
    return admin
  }

  // ─── Password helpers used by AdminService for create / update ─

  async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, BCRYPT_ROUNDS)
  }

  async ensureEmailFree(email: string): Promise<void> {
    const exists = await this.admins.findOne({
      where: { email: email.toLowerCase() },
    })
    if (exists) throw new ConflictException('Email already registered')
  }

  // Touch helper for AdminService.changeOwnPassword — wipes all other
  // refresh sessions when password changes (kicking out other devices).
  async revokeAllExceptCurrent(
    adminId: string,
    currentJti: string | null,
  ): Promise<void> {
    const rows = await this.refreshTokens.find({
      where: { admin_id: adminId, revoked_at: IsNull() },
    })
    for (const r of rows) {
      if (currentJti && (await bcrypt.compare(currentJti, r.token_hash)))
        continue
      r.revoked_at = new Date()
      await this.refreshTokens.save(r)
    }
  }
}

// Re-export so guards can `throw new BadRequestException(...)` etc.
// without each importing them separately. Just a convenience.
export {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
}
