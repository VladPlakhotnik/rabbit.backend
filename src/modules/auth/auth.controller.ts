import {
  Controller,
  Get,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  Logger,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Delete,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import { Request, Response } from 'express'
import { AuthService } from './auth.service'
import { UserService } from '../users/users.service'
import { TelegramService } from '../social/services/telegram.service'
import { ERROR_MESSAGES } from '../../constants/errorMessages'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger'
import { User } from '../users/user.entity'
import { LinkTelegramDto } from './dto/link-telegram.dto'
import { TelegramMiniAppDto } from './dto/telegram-miniapp.dto'
import {
  clearUserRefreshCookie,
  readUserRefreshCookie,
  setUserRefreshCookie,
} from './auth-cookies'
import {
  clearSteamLinkStateCookie,
  readSteamLinkStateCookie,
} from './steam-link-state'
import { getClientIp, getUserAgent } from '../../common/helpers/request-meta'
import type {
  SteamAuthResult,
  GoogleAuthResult,
  TelegramAuthResult,
  AuthCallbackUserData,
} from './types/auth.types'

interface RequestWithUser extends Omit<Request, 'user'> {
  user: { id: number }
}

// Vocabulary for the post-OAuth redirect URLs. The frontend's
// AuthCallback / AuthError pages parse these values straight out of
// the query string - keep both sides in sync.
type AuthProvider = 'steam' | 'google' | 'telegram'
type AuthAction = 'auth' | 'link'
type AuthErrorReason =
  | 'already_linked'
  | 'session_expired'
  | 'invalid_credentials'
  | 'unknown'

// All endpoints carry the per-IP throttler. The OAuth dance (steam,
// google, telegram callbacks) and refresh / mini-app sign-in are the
// abuse-prone surface; specific limits live in @Throttle on each
// handler. Without ThrottlerGuard mounted here, @Throttle is a no-op.
@ApiTags('auth')
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  private readonly logger = new Logger(AuthController.name)

  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
    private readonly telegramService: TelegramService,
  ) {}

  @ApiOperation({ summary: 'Steam login' })
  @ApiResponse({ status: 200, description: 'Steam login successful' })
  @Get('steam')
  @UseGuards(AuthGuard('steam'))
  steamLogin() {}

  @ApiOperation({ summary: 'Google login' })
  @ApiResponse({ status: 200, description: 'Google login successful' })
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleLogin() {}

  @ApiOperation({ summary: 'Steam login callback' })
  @ApiResponse({ status: 200, description: 'Steam login callback successful' })
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('steam/return')
  @UseGuards(AuthGuard('steam'))
  async steamLoginCallback(@Req() req: Request, @Res() res: Response) {
    try {
      const steamUser = req.user as unknown as SteamAuthResult

      if (!steamUser) {
        throw new UnauthorizedException(ERROR_MESSAGES.AUTH.NOT_AUTHENTICATED)
      }

      // Keep Steam ID as string to avoid precision loss (Steam IDs can exceed Number.MAX_SAFE_INTEGER)
      const steamIdString = steamUser.steam_id

      if (!steamIdString || steamIdString.trim() === '') {
        this.logger.error(`Invalid Steam ID format: ${steamUser.steam_id}`)
        throw new UnauthorizedException(ERROR_MESSAGES.AUTH.INVALID_CREDENTIALS)
      }

      this.logger.log(`Steam login attempt for Steam ID: ${steamIdString}`)

      // Linking branch: if the JWT-protected /users/me/link/steam
      // endpoint set the state cookie, this round-trip is meant to
      // attach Steam to that user, not start a new session. The
      // cookie value is HMAC-signed and short-lived, so the user id
      // it carries is trustworthy. Sign-in flow continues unchanged
      // when the cookie is absent / invalid / expired.
      const linkingUserId = readSteamLinkStateCookie(req)
      if (linkingUserId !== null) {
        clearSteamLinkStateCookie(res)
        try {
          const linkedUser = await this.userService.linkSteamAccount(
            linkingUserId,
            steamIdString,
          )
          this.logger.log(
            `Steam ${steamIdString} linked to user ${linkedUser.id}`,
          )
        } catch (linkErr: unknown) {
          // Linking failed -> /auth/error with reason; the original
          // session is untouched.
          this.logger.warn(
            `Steam link failed for user ${linkingUserId}: ${
              linkErr instanceof Error ? linkErr.message : 'Unknown error'
            }`,
          )
          return res.redirect(this.buildErrorUrl('steam', 'link', linkErr))
        }
        return res.redirect(this.buildSuccessUrl('steam', 'link'))
      }

      const userData: AuthCallbackUserData = {
        steam_id: steamIdString,
        display_name: steamUser.display_name ?? '',
        avatar: steamUser.avatar ?? '',
        profile_url: steamUser.profile_url ?? '',
      }

      await this.handleAuthCallback(
        userData,
        () => {
          this.logger.log(`Searching for user with Steam ID: ${steamIdString}`)
          return this.userService.findBySteamId(steamIdString)
        },
        'Steam',
        req,
        res,
      )

      return res.redirect(this.buildSuccessUrl('steam', 'auth'))
    } catch (error: unknown) {
      this.handleAuthError(error, res, 'steam', 'auth')
    }
  }

  @ApiOperation({ summary: 'Google login callback' })
  @ApiResponse({ status: 200, description: 'Google login callback successful' })
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleLoginCallback(@Req() req: Request, @Res() res: Response) {
    try {
      const googleUser = req.user as unknown as GoogleAuthResult

      if (!googleUser || !googleUser.google_id) {
        throw new UnauthorizedException(ERROR_MESSAGES.AUTH.NOT_AUTHENTICATED)
      }

      const userData: AuthCallbackUserData = {
        google_id: googleUser.google_id,
        steam_id: null,
        telegram_user_id: null,
        display_name: googleUser.display_name,
        avatar: googleUser.avatar || '',
        profile_url: '',
      }

      await this.handleAuthCallback(
        userData,
        () => this.userService.findByGoogleId(googleUser.google_id),
        'Google',
        req,
        res,
      )

      return res.redirect(this.buildSuccessUrl('google', 'auth'))
    } catch (error: unknown) {
      this.handleAuthError(error, res, 'google', 'auth')
    }
  }

  @ApiOperation({ summary: 'Telegram login callback' })
  @ApiResponse({
    status: 200,
    description: 'Telegram login callback successful',
  })
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('telegram/callback')
  @UseGuards(AuthGuard('telegram'))
  async telegramLoginCallback(@Req() req: Request, @Res() res: Response) {
    try {
      const telegramUser = req.user as unknown as TelegramAuthResult

      if (!telegramUser || !telegramUser.telegram_id) {
        throw new UnauthorizedException(ERROR_MESSAGES.AUTH.NOT_AUTHENTICATED)
      }

      // Sign-in / sign-up only. Account Settings no longer exposes
      // Telegram linking; the old `link_to_user_id` query flow was
      // intentionally removed because it let request input choose the
      // destination user.
      const userData: AuthCallbackUserData = {
        telegram_user_id: telegramUser.telegram_id,
        steam_id: null,
        display_name: telegramUser.display_name,
        avatar: telegramUser.avatar || '',
        profile_url: '',
      }

      await this.handleAuthCallback(
        userData,
        () => this.userService.findByTelegramId(telegramUser.telegram_id),
        'Telegram',
        req,
        res,
      )

      return res.redirect(this.buildSuccessUrl('telegram', 'auth'))
    } catch (error: unknown) {
      this.handleAuthError(error, res, 'telegram', 'auth')
    }
  }

  @ApiOperation({
    summary:
      'Link Telegram to the currently authenticated account. Body must be the verbatim payload from Telegram Login Widget. The owning user is derived from the JWT, never from request input.',
  })
  @ApiResponse({ status: 200, description: 'Telegram successfully linked' })
  @ApiResponse({ status: 400, description: 'Invalid Telegram payload / already linked elsewhere' })
  @ApiResponse({ status: 401, description: 'Caller is not authenticated' })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('telegram/link')
  @UseGuards(AuthGuard('jwt'))
  async linkTelegram(
    @Req() req: RequestWithUser,
    @Body() body: LinkTelegramDto,
  ): Promise<{ success: true; user: { id: number; telegram_user_id: number } }> {
    const telegramId = await this.telegramService.verifyAuthData({
      id: body.id,
      first_name: body.first_name,
      last_name: body.last_name,
      username: body.username,
      photo_url: body.photo_url,
      auth_date: body.auth_date,
      hash: body.hash,
    })

    const updated = await this.userService.updateTelegramIdOnly(
      req.user.id,
      telegramId,
    )

    return {
      success: true,
      user: {
        id: updated.id,
        telegram_user_id: updated.telegram_user_id ?? 0,
      },
    }
  }

  @ApiOperation({
    summary:
      'Sign in / sign up via Telegram Mini App. Body must carry the verbatim `window.Telegram.WebApp.initData` query string. Server verifies the Mini-App-style HMAC (different from the Login Widget) and either logs in the existing telegram_user_id or creates a new account.',
  })
  @ApiResponse({ status: 200, description: 'JWT pair issued' })
  @ApiResponse({ status: 400, description: 'initData malformed' })
  @ApiResponse({ status: 401, description: 'initData expired / hash mismatch / replay' })
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('telegram/miniapp')
  async telegramMiniAppLogin(
    @Body() body: TelegramMiniAppDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    const verified = await this.telegramService.verifyInitData(body.initData)

    // Build a display_name with sensible fallbacks - Telegram users
    // without a public username and a single-word first name are common
    // (especially mobile-only). We never want a blank display_name.
    const displayName =
      [verified.firstName, verified.lastName]
        .filter((s): s is string => Boolean(s))
        .join(' ')
        .trim() ||
      verified.username ||
      `tg_${verified.telegramId}`

    const userData: AuthCallbackUserData = {
      telegram_user_id: verified.telegramId,
      steam_id: null,
      google_id: null,
      display_name: displayName,
      avatar: verified.photoUrl ?? '',
      profile_url: '',
    }

    // MiniApp lives inside the Telegram client - there is no browser
    // redirect to a frontend route, so we return the access token in
    // the body and stash refresh in the same HttpOnly cookie the OAuth
    // callbacks use. Subsequent /auth/refresh calls then rotate it.
    const tokens = await this.handleAuthCallback(
      userData,
      () => this.userService.findByTelegramId(verified.telegramId),
      'TelegramMiniApp',
      req,
      res,
    )
    return { accessToken: tokens.accessToken }
  }

  @ApiOperation({
    summary:
      'Refresh access token. Refresh JWT travels in the HttpOnly user_rt cookie set by /auth/* callbacks; the request body is ignored. The endpoint rotates BOTH tokens - the old refresh is consumed (one-shot) and a fresh pair is issued. The new refresh is set on the cookie; the new access is returned in the response body.',
  })
  @ApiResponse({ status: 200, description: 'New access token; refresh rotated via cookie' })
  @ApiResponse({ status: 401, description: 'Invalid or reused refresh token' })
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshToken(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    // Body kept ONLY for the deprecated dev tooling that posted the
    // refresh in JSON. It will be removed once everything flips to
    // cookies; in the meantime the cookie wins if both are present.
    @Body('refreshToken') bodyRefreshToken?: string,
  ): Promise<{ accessToken: string }> {
    const presented =
      readUserRefreshCookie(req) ??
      (typeof bodyRefreshToken === 'string' && bodyRefreshToken.length > 0
        ? bodyRefreshToken
        : null)

    if (!presented) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.INVALID_REFRESH_TOKEN)
    }

    try {
      const ip = getClientIp(req)
      const userAgent = getUserAgent(req)
      const pair = await this.authService.refreshToken(presented, ip, userAgent)
      setUserRefreshCookie(res, pair.refreshToken)
      return { accessToken: pair.accessToken }
    } catch (error: unknown) {
      // On any failure (expired, reused, forged) wipe the cookie so the
      // next request from this browser starts clean instead of repeatedly
      // tripping reuse-detection on the same dead token.
      clearUserRefreshCookie(res)
      this.logger.error(
        `Token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.INVALID_REFRESH_TOKEN)
    }
  }

  @ApiOperation({
    summary:
      'Logout: revoke the presented refresh token and clear the cookie. Returns 204 even if the token was already invalid - the client wipes local state regardless.',
  })
  @ApiResponse({ status: 204, description: 'Logged out (best-effort revoke)' })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const presented = readUserRefreshCookie(req)
    await this.authService.logout(presented)
    clearUserRefreshCookie(res)
  }

  // --- Active sessions --------------------------------------------
  // Surface for "what's logged into my account" UIs. Each item maps
  // to one device/browser. Bearer-protected; the user only sees their
  // own rows.

  @ApiOperation({ summary: 'List active sessions for the current user' })
  @ApiResponse({ status: 200, description: 'Array of session rows' })
  @ApiBearerAuth()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('sessions')
  @UseGuards(AuthGuard('jwt'))
  async listSessions(@Req() req: RequestWithUser) {
    return this.authService.listActiveSessions(req.user.id)
  }

  @ApiOperation({ summary: 'Revoke one session by id' })
  @ApiResponse({ status: 204, description: 'Revoked' })
  @ApiBearerAuth()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard('jwt'))
  async revokeSession(
    @Req() req: RequestWithUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.authService.revokeSession(req.user.id, id)
  }

  @ApiOperation({
    summary:
      'Revoke every session except the current one. The "current" session is identified by the jti carried in the user_rt cookie. Without the cookie, no rows are skipped - the caller will be logged out on next 401.',
  })
  @ApiResponse({ status: 200, description: '{ revoked: number }' })
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('sessions/revoke-others')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  async revokeOtherSessions(
    @Req() req: RequestWithUser,
  ): Promise<{ revoked: number }> {
    const refreshToken = readUserRefreshCookie(req as unknown as Request)
    let currentJti = ''
    if (refreshToken) {
      const jti = await this.authService.peekRefreshJti(refreshToken)
      if (jti) currentJti = jti
    }
    const revoked = await this.authService.revokeOtherSessions(req.user.id, currentJti)
    return { revoked }
  }

  /**
   * Resolves the user (creating them on first sign-in), issues a fresh
   * access+refresh pair, sets the refresh on the HttpOnly cookie, and
   * returns the pair so the caller can decide what to do with the
   * access token (redirect for OAuth, body for MiniApp).
   *
   * Tokens are NEVER appended to the redirect URL - that was leaking
   * them through browser history, server access logs, and Referer.
   */
  private async handleAuthCallback(
    userData: AuthCallbackUserData,
    findUserFn: () => Promise<User | null>,
    providerName: string,
    req: Request,
    res: Response,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const existingUser = await findUserFn()
    const ip = getClientIp(req)
    const userAgent = getUserAgent(req)

    let user: User
    if (existingUser) {
      this.logger.log(
        `${providerName} authentication: Found existing user with ID ${existingUser.id}`,
      )
      user = existingUser
    } else {
      // First sign-in via this provider. The clicker profile is no
      // longer materialised here - it's created lazily the first time
      // the player actually visits the clicker tab (see
      // ClickerUserService.findOrCreateByUserId), so users who never
      // touch the clicker don't accumulate dead rows in `clicker_users`.
      this.logger.log(
        `${providerName} authentication: Creating new user with ${providerName} ID`,
      )
      user = await this.userService.create(this.createDefaultUserData(userData))
      this.logger.log(
        `${providerName} authentication: Created new user with ID ${user.id}`,
      )
    }

    const pair = await this.authService.login(user, ip, userAgent)
    setUserRefreshCookie(res, pair.refreshToken)
    return pair
  }

  // -- Post-OAuth redirect targets (frontend) ------------------------
  //
  // Two routes, two responsibilities:
  //   - /auth/callback  - happy path: sign-in, sign-up, link success.
  //   - /auth/error     - anything that went wrong, with reason code
  //                       so the SPA can show a specific message.
  //
  // Both carry `?action=auth|link&provider=steam|google|telegram` so
  // the frontend doesn't have to guess which flow the user came from.
  // FRONTEND_URL is mandatory in production; the localhost fallback is
  // only safe in dev.
  private frontendBase(): string {
    return process.env.FRONTEND_URL || 'http://localhost:3000'
  }

  private buildSuccessUrl(
    provider: AuthProvider,
    action: AuthAction,
  ): string {
    return `${this.frontendBase()}/auth/callback?action=${action}&provider=${provider}`
  }

  /**
   * Builds the error redirect URL with a stable `reason` code so the
   * SPA can pick a specific translation ("This Google account is
   * already linked to another user" rather than a generic "linking
   * failed"). Reason codes must stay in sync with the
   * `AUTH_ERROR_REASON_KEYS` lookup on the frontend's AuthError page.
   */
  private buildErrorUrl(
    provider: AuthProvider,
    action: AuthAction,
    err: unknown,
  ): string {
    return `${this.frontendBase()}/auth/error?action=${action}&provider=${provider}&reason=${this.mapErrorToReason(err)}`
  }

  private mapErrorToReason(err: unknown): AuthErrorReason {
    const message = err instanceof Error ? err.message.toLowerCase() : ''
    if (message.includes('already linked')) return 'already_linked'
    if (
      message.includes('expired') ||
      message.includes('replay') ||
      message.includes('not authenticated')
    ) {
      return 'session_expired'
    }
    if (
      message.includes('invalid_credentials') ||
      message.includes('invalid credentials') ||
      message.includes('hash mismatch')
    ) {
      return 'invalid_credentials'
    }
    return 'unknown'
  }

  /**
   * Creates default user data for new users
   */
  private createDefaultUserData(userData: AuthCallbackUserData): Partial<User> {
    // Convert steam_id string to number, but handle large numbers carefully
    // For Steam IDs larger than MAX_SAFE_INTEGER, we'll pass as string
    // and let TypeORM/PostgreSQL handle the conversion to bigint
    const steamIdValue = this.normalizeSteamId(userData.steam_id)

    return {
      steam_id: steamIdValue as number | null,
      telegram_user_id: userData.telegram_user_id ?? null,
      google_id: userData.google_id ?? null,
      display_name: userData.display_name,
      avatar: userData.avatar,
      profile_url: userData.profile_url,
      role: 'player', // PlayerRole.PLAYER - default for newly-registered users
      balance: 0,
      trade_link: null,
      referral_parent_id: null,
      opened_cases: 0,
      upgraded_skins: 0,
      deposit_amount: 0,
      vip_qualifying_volume: 0,
      vip_xp: 0,
      vip_theoretical_rake: 0,
      withdrawal_amount: 0,
      rank: 'initiate_1',
      created_at: new Date(),
    }
  }

  /**
   * Normalizes Steam ID to number or string for database storage
   */
  private normalizeSteamId(
    steamId: string | number | null | undefined,
  ): number | string | null {
    if (steamId === null || steamId === undefined) {
      return null
    }

    if (typeof steamId === 'number') {
      return steamId
    }

    if (typeof steamId === 'string') {
      try {
        const bigIntValue = BigInt(steamId)
        // Check if it's within safe integer range
        if (bigIntValue <= BigInt(Number.MAX_SAFE_INTEGER)) {
          return Number(bigIntValue)
        }
        // For very large Steam IDs, preserve as string for precision
        return steamId
      } catch {
        this.logger.warn(`Invalid Steam ID format: ${steamId}`)
        return null
      }
    }

    return null
  }

  /**
   * Logs the failure and bounces the browser to the frontend's
   * /auth/error page with provider + action + reason carried in the
   * query string. The SPA picks the right translation key from the
   * (provider, action, reason) triple.
   */
  private handleAuthError(
    error: unknown,
    res: Response,
    provider: AuthProvider,
    action: AuthAction,
  ): void {
    const message = error instanceof Error ? error.message : 'Unknown error'
    this.logger.error(`${provider} ${action} error: ${message}`)
    res.redirect(this.buildErrorUrl(provider, action, error))
  }
}
