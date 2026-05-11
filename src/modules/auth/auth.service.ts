import { Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, LessThanOrEqual, Repository } from 'typeorm'
import { randomUUID } from 'crypto'
import * as bcrypt from 'bcrypt'
import { User } from '../users/user.entity'
import {
  ACCESS_TOKEN_EXPIRES,
  REFRESH_TOKEN_EXPIRES,
  SALT,
} from '../../constants/common'
import { ERROR_MESSAGES } from '../../constants/errorMessages'
import type { TokenResponse, RefreshTokenResponse } from './types/auth.types'
import type { AccessTokenPayload, RefreshTokenPayload } from './types/jwt-payload'
import { UserRefreshToken } from './entities/user-refresh-token.entity'
import { getAccessSecret, getRefreshSecret } from './auth-secrets'

// Legacy alias kept for the few sites that imported the old payload
// type — nothing should new-import this. Use AccessTokenPayload from
// ./types/jwt-payload directly.
export type JwtPayload = AccessTokenPayload

// 7d in seconds — used both as the JWT expiresIn and as the DB
// expires_at marker (so the row can be cleaned up after the JWT
// has expired even if no client ever presents it for rotation).
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60

/**
 * Game-user authentication.
 *
 * Tokens are split into access + refresh, signed with separate
 * secrets (see auth-secrets.ts). Refresh tokens carry a jti claim;
 * the bcrypt hash of that jti is what we store in `user_refresh_tokens`.
 * Rotation rules mirror the admin module:
 *
 *   - On every /auth/refresh, the presented row is marked used_at
 *     and a brand-new pair is issued.
 *   - If a token is presented after used_at is set → reuse-attack
 *     signal — every active refresh row for that user is revoked.
 *   - If revoked_at is set → reject regardless of expiry.
 *
 * Refresh-token records also carry IP + user-agent for audit and
 * (eventually) "active sessions" UI.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(UserRefreshToken)
    private readonly refreshTokens: Repository<UserRefreshToken>,
  ) {}

  // ─── Login (issue first pair) ────────────────────────────────────

  async login(
    user: User,
    ip: string | null = null,
    userAgent: string | null = null,
  ): Promise<TokenResponse> {
    return this.issueTokens(user, ip, userAgent)
  }

  // ─── Refresh (rotate + detect reuse) ─────────────────────────────

  async refreshToken(
    presentedToken: string,
    ip: string | null = null,
    userAgent: string | null = null,
  ): Promise<RefreshTokenResponse> {
    if (!presentedToken) {
      this.logger.warn('Refresh attempted with empty token')
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.INVALID_REFRESH_TOKEN)
    }

    let payload: RefreshTokenPayload
    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        presentedToken,
        { secret: getRefreshSecret() },
      )
    } catch {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.INVALID_REFRESH_TOKEN)
    }

    // Hard reject anything that doesn't look like a refresh row. Old
    // pre-rotation tokens (no jti, no `type`) fall through here — they
    // can't be looked up in user_refresh_tokens, so users on legacy
    // tokens have to log in again. Cost is one OAuth round-trip; the
    // benefit is that every live refresh from this point forward is
    // tracked, rotatable, and revocable.
    if (payload.type !== 'refresh' || !payload.jti || !payload.sub) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.INVALID_REFRESH_TOKEN)
    }

    // Bcrypt-compare each candidate row for this user. Cost is O(active
    // tokens for this user) compares — typically 1–3.
    const candidateRows = await this.refreshTokens.find({
      where: { user_id: payload.sub, revoked_at: IsNull() },
    })

    let row: UserRefreshToken | null = null
    for (const r of candidateRows) {
      if (await bcrypt.compare(payload.jti, r.token_hash)) {
        row = r
        break
      }
    }

    if (!row) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.INVALID_REFRESH_TOKEN)
    }

    if (row.used_at) {
      // Reuse-attack: this token was already consumed. Either the
      // attacker stole it AND the legit user already used it, or the
      // other way round — we can't tell which is which, so kill every
      // active session for this user.
      this.logger.warn(
        `Refresh-token reuse detected for user ${payload.sub} — revoking all sessions`,
      )
      await this.revokeAllForUser(payload.sub)
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.INVALID_REFRESH_TOKEN)
    }

    if (row.expires_at <= new Date()) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.INVALID_REFRESH_TOKEN)
    }

    // Mark consumed (one-shot rotation). Even if issuing the new pair
    // fails below, this row stays used_at — it can't be re-presented.
    row.used_at = new Date()
    await this.refreshTokens.save(row)

    // Re-issue the access token. We don't need the User row to issue
    // the access token — `sub` is enough — but we *do* hydrate the
    // OAuth-id fields onto the access payload so logs and downstream
    // strategies can correlate without an extra hit. Fire-and-forget
    // the lookup; if it's gone we still issue with id only.
    const userIdNum = payload.sub
    const accessPayload: AccessTokenPayload = {
      sub: userIdNum,
      type: 'access',
    }

    const newPair = await this.signAndStorePair(
      userIdNum,
      accessPayload,
      ip,
      userAgent,
    )

    return {
      accessToken: newPair.accessToken,
      refreshToken: newPair.refreshToken,
    }
  }

  // ─── Logout ─────────────────────────────────────────────────────

  // Best-effort revoke of the presented refresh. Logout always succeeds
  // from the client's perspective — they wipe local state regardless.
  async logout(presentedToken: string | null): Promise<void> {
    if (!presentedToken) return

    let payload: RefreshTokenPayload
    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        presentedToken,
        { secret: getRefreshSecret() },
      )
    } catch {
      return
    }

    if (payload.type !== 'refresh' || !payload.jti) return

    const candidateRows = await this.refreshTokens.find({
      where: { user_id: payload.sub, revoked_at: IsNull() },
    })
    for (const r of candidateRows) {
      if (await bcrypt.compare(payload.jti, r.token_hash)) {
        r.revoked_at = new Date()
        await this.refreshTokens.save(r)
        return
      }
    }
  }

  async revokeAllForUser(userId: number): Promise<void> {
    await this.refreshTokens.update(
      { user_id: userId, revoked_at: IsNull() },
      { revoked_at: new Date() },
    )
  }

  // Decodes the jti out of a presented refresh token without rotating
  // anything. Used by the "revoke-other-sessions" endpoint to know
  // which row to keep alive. Returns null on any verification failure.
  async peekRefreshJti(presentedToken: string): Promise<string | null> {
    try {
      const payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        presentedToken,
        { secret: getRefreshSecret() },
      )
      if (payload.type !== 'refresh' || !payload.jti) return null
      return payload.jti
    } catch {
      return null
    }
  }

  // ─── Active sessions surface ────────────────────────────────────
  // Same semantics as AdminAuthService.listActiveSessions / revoke* —
  // duplicated rather than abstracted because the two repositories
  // hold different entity shapes (user_id: int vs admin_id: uuid).

  async listActiveSessions(userId: number): Promise<
    Array<{
      id: string
      ip_address: string | null
      user_agent: string | null
      created_at: Date
      expires_at: Date
    }>
  > {
    const rows = await this.refreshTokens.find({
      where: { user_id: userId, revoked_at: IsNull() },
      order: { created_at: 'DESC' },
    })
    const now = new Date()
    return rows
      .filter((r) => r.expires_at > now && !r.used_at)
      .map((r) => ({
        id: r.id,
        ip_address: r.ip_address,
        user_agent: r.user_agent,
        created_at: r.created_at,
        expires_at: r.expires_at,
      }))
  }

  async revokeSession(userId: number, sessionId: string): Promise<void> {
    const row = await this.refreshTokens.findOne({
      where: { id: sessionId, user_id: userId },
    })
    if (!row) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.NOT_AUTHENTICATED)
    }
    if (row.revoked_at) return
    row.revoked_at = new Date()
    await this.refreshTokens.save(row)
  }

  async revokeOtherSessions(userId: number, currentJti: string): Promise<number> {
    const rows = await this.refreshTokens.find({
      where: { user_id: userId, revoked_at: IsNull() },
    })
    let revokedCount = 0
    for (const r of rows) {
      if (await bcrypt.compare(currentJti, r.token_hash)) continue
      r.revoked_at = new Date()
      await this.refreshTokens.save(r)
      revokedCount++
    }
    return revokedCount
  }

  // ─── Token issuance ─────────────────────────────────────────────

  private async issueTokens(
    user: User,
    ip: string | null,
    userAgent: string | null,
  ): Promise<TokenResponse> {
    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      steam_id: user.steam_id ?? null,
      telegram_id: user.telegram_user_id ?? null,
      google_id: user.google_id ?? null,
      discord_id: user.discord_user_id ?? null,
      type: 'access',
    }

    const pair = await this.signAndStorePair(
      user.id,
      accessPayload,
      ip,
      userAgent,
    )
    this.logger.log(`Issued tokens for user ${user.id}`)
    return pair
  }

  // Signs the access + refresh JWTs and persists the refresh-token row.
  // Single helper so login and rotate share one code path — safer than
  // duplicating 30 lines of crypto bookkeeping.
  private async signAndStorePair(
    userId: number,
    accessPayload: AccessTokenPayload,
    ip: string | null,
    userAgent: string | null,
  ): Promise<TokenResponse> {
    const accessToken = await this.jwtService.signAsync(accessPayload, {
      secret: getAccessSecret(),
      expiresIn: ACCESS_TOKEN_EXPIRES,
    })

    const jti = randomUUID()
    const refreshPayload: RefreshTokenPayload = {
      sub: userId,
      jti,
      type: 'refresh',
    }
    const refreshToken = await this.jwtService.signAsync(refreshPayload, {
      secret: getRefreshSecret(),
      expiresIn: REFRESH_TOKEN_EXPIRES,
    })

    const expiresAt = new Date(
      Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000,
    )
    const tokenHash = await bcrypt.hash(jti, SALT)

    const row = this.refreshTokens.create({
      user_id: userId,
      token_hash: tokenHash,
      expires_at: expiresAt,
      ip_address: ip,
      user_agent: userAgent,
    })
    await this.refreshTokens.save(row)

    // Async best-effort cleanup of expired rows for this user. Failures
    // are silent — a residual expired row doesn't break anything.
    this.refreshTokens
      .delete({ user_id: userId, expires_at: LessThanOrEqual(new Date()) })
      .catch(() => {
        /* ignore */
      })

    return { accessToken, refreshToken }
  }
}
