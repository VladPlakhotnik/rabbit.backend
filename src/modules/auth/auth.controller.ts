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
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { Request, Response } from 'express'
import { AuthService } from './auth.service'
import { UserService } from '../users/users.service'
import { TelegramService } from '../social/services/telegram.service'
import { ERROR_MESSAGES } from '../../constants/errorMessages'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { User } from '../users/user.entity'
import { LinkTelegramDto } from './dto/link-telegram.dto'
import { TelegramMiniAppDto } from './dto/telegram-miniapp.dto'
import type {
  SteamAuthResult,
  GoogleAuthResult,
  TelegramAuthResult,
  AuthCallbackUserData,
} from './types/auth.types'

interface RequestWithUser extends Omit<Request, 'user'> {
  user: { id: number }
}

@ApiTags('auth')
@Controller('auth')
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

      // Steam linking via `?link_to_user_id=` query was an account-takeover
      // hole identical to the one we just fixed for Telegram — the caller
      // fully controlled the destination user id, so anyone could attach
      // their Steam to anybody's account. Removed here; Steam linking
      // needs a proper state-cookie flow (Steam OpenID has no JWT context
      // in its callback, so we have to round-trip a server-issued state
      // through the Steam redirect) and is tracked as a follow-up.
      const userData: AuthCallbackUserData = {
        steam_id: steamIdString,
        display_name: steamUser.display_name ?? '',
        avatar: steamUser.avatar ?? '',
        profile_url: steamUser.profile_url ?? '',
      }

      const token = await this.handleAuthCallback(
        userData,
        () => {
          this.logger.log(`Searching for user with Steam ID: ${steamIdString}`)
          return this.userService.findBySteamId(steamIdString)
        },
        'Steam',
      )

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
      return res.redirect(
        `${frontendUrl}/auth/callback?accessToken=${token.accessToken}&refreshToken=${token.refreshToken}`,
      )
    } catch (error: unknown) {
      this.handleAuthError(error, res, 'Steam')
    }
  }

  @ApiOperation({ summary: 'Google login callback' })
  @ApiResponse({ status: 200, description: 'Google login callback successful' })
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

      const token = await this.handleAuthCallback(
        userData,
        () => this.userService.findByGoogleId(googleUser.google_id),
        'Google',
      )

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
      return res.redirect(
        `${frontendUrl}/auth/callback?accessToken=${token.accessToken}&refreshToken=${token.refreshToken}`,
      )
    } catch (error: unknown) {
      this.handleAuthError(error, res, 'Google')
    }
  }

  @ApiOperation({ summary: 'Telegram login callback' })
  @ApiResponse({
    status: 200,
    description: 'Telegram login callback successful',
  })
  @Get('telegram/callback')
  @UseGuards(AuthGuard('telegram'))
  async telegramLoginCallback(@Req() req: Request, @Res() res: Response) {
    try {
      const telegramUser = req.user as unknown as TelegramAuthResult

      if (!telegramUser || !telegramUser.telegram_id) {
        throw new UnauthorizedException(ERROR_MESSAGES.AUTH.NOT_AUTHENTICATED)
      }

      // Sign-in / sign-up only. Linking now lives on the JWT-protected
      // POST /auth/telegram/link endpoint below — the previous behaviour
      // of taking `link_to_user_id` from the URL was an account-takeover
      // hole (any caller could attach their Telegram to anyone's user
      // by crafting the query string).
      const userData: AuthCallbackUserData = {
        telegram_user_id: telegramUser.telegram_id,
        steam_id: null,
        display_name: telegramUser.display_name,
        avatar: telegramUser.avatar || '',
        profile_url: '',
      }

      const token = await this.handleAuthCallback(
        userData,
        () => this.userService.findByTelegramId(telegramUser.telegram_id),
        'Telegram',
      )

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
      return res.redirect(
        `${frontendUrl}/auth/callback?accessToken=${token.accessToken}&refreshToken=${token.refreshToken}`,
      )
    } catch (error: unknown) {
      this.handleAuthError(error, res, 'Telegram')
    }
  }

  @ApiOperation({
    summary:
      'Link Telegram to the currently authenticated account. Body must be the verbatim payload from Telegram Login Widget (or any future bot/Mini-App auth surface). The owning user is derived from the JWT — never from request input.',
  })
  @ApiResponse({ status: 200, description: 'Telegram successfully linked' })
  @ApiResponse({ status: 400, description: 'Invalid Telegram payload / already linked elsewhere' })
  @ApiResponse({ status: 401, description: 'Caller is not authenticated' })
  @Post('telegram/link')
  @UseGuards(AuthGuard('jwt'))
  async linkTelegram(
    @Req() req: RequestWithUser,
    @Body() body: LinkTelegramDto,
  ): Promise<{ success: true; user: { id: number; telegram_user_id: number } }> {
    // Verify the payload exactly the way the sign-in passport strategy
    // does — same HMAC, same auth_date window, same Redis-backed replay
    // gate. We use the same TelegramService method directly here instead
    // of bouncing through the passport strategy because that strategy
    // sources its data from the URL query, and we want body input.
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
  @Post('telegram/miniapp')
  async telegramMiniAppLogin(
    @Body() body: TelegramMiniAppDto,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const verified = await this.telegramService.verifyInitData(body.initData)

    // Build a display_name with sensible fallbacks — Telegram users
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

    return await this.handleAuthCallback(
      userData,
      () => this.userService.findByTelegramId(verified.telegramId),
      'TelegramMiniApp',
    )
  }

  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  @Post('refresh')
  async refreshToken(@Body('refreshToken') refreshToken: string | undefined) {
    if (!refreshToken || typeof refreshToken !== 'string') {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.INVALID_REFRESH_TOKEN)
    }

    try {
      const result = await this.authService.refreshToken(refreshToken)
      return result
    } catch (error: unknown) {
      this.logger.error(
        `Token refresh failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.INVALID_REFRESH_TOKEN)
    }
  }

  /**
   * Common handler for authentication callbacks
   */
  private async handleAuthCallback(
    userData: AuthCallbackUserData,
    findUserFn: () => Promise<User | null>,
    providerName: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const existingUser = await findUserFn()

    if (existingUser) {
      this.logger.log(
        `${providerName} authentication: Found existing user with ID ${existingUser.id}`,
      )
      return await this.authService.login(existingUser)
    }

    // No existing user found, create new one. The clicker profile is no
    // longer materialised here — it's created lazily the first time the
    // player actually visits the clicker tab (see ClickerUserService
    // .findOrCreateByUserId), so users who never touch the clicker don't
    // accumulate dead rows in `clicker_users`.
    this.logger.log(
      `${providerName} authentication: Creating new user with ${providerName} ID`,
    )
    const newUser = await this.userService.create(
      this.createDefaultUserData(userData),
    )

    this.logger.log(
      `${providerName} authentication: Created new user with ID ${newUser.id}`,
    )
    return await this.authService.login(newUser)
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
      role: 'user',
      balance: 0,
      trade_link: null,
      referral_parent_id: null,
      opened_cases: 0,
      upgraded_skins: 0,
      deposit_amount: 0,
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
   * Handles authentication errors consistently
   */
  private handleAuthError(
    error: unknown,
    res: Response,
    providerName: string,
  ): void {
    const message = error instanceof Error ? error.message : 'Unknown error'
    this.logger.error(`${providerName} authentication error: ${message}`)
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
    res.redirect(`${frontendUrl}/auth/error`)
  }
}
