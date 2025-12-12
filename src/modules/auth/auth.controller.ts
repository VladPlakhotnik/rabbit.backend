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
import { ClickerUserService } from '../clickerUser/clicker-user.service'
import { ERROR_MESSAGES } from '../../constants/errorMessages'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { User } from '../users/user.entity'
import type {
  SteamAuthResult,
  GoogleAuthResult,
  TelegramAuthResult,
  AuthCallbackUserData,
} from './types/auth.types'

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name)

  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
    private readonly clickerUserService: ClickerUserService,
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

      // Check if this is a linking request (user wants to link Steam to existing account)
      const linkToUserIdParam = req.query.link_to_user_id
      const linkToUserId =
        linkToUserIdParam && typeof linkToUserIdParam === 'string'
          ? parseInt(linkToUserIdParam, 10)
          : null

      if (linkToUserId !== null && !isNaN(linkToUserId) && linkToUserId > 0) {
        // Link Steam account to existing user without changing other data
        this.logger.log(
          `Linking Steam account to existing user ${linkToUserId}`,
        )
        const updatedUser = await this.userService.updateSteamIdOnly(
          linkToUserId,
          steamIdString,
        )

        const token = await this.authService.login(updatedUser)
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
        return res.redirect(
          `${frontendUrl}/auth/callback?accessToken=${token.accessToken}&refreshToken=${token.refreshToken}`,
        )
      }

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

      // Check if this is a linking request (user wants to link Telegram to existing account)
      const linkToUserIdParam = req.query.link_to_user_id
      const linkToUserId =
        linkToUserIdParam && typeof linkToUserIdParam === 'string'
          ? parseInt(linkToUserIdParam, 10)
          : null

      if (linkToUserId !== null && !isNaN(linkToUserId) && linkToUserId > 0) {
        // Link Telegram account to existing user without changing other data
        this.logger.log(
          `Linking Telegram account to existing user ${linkToUserId}`,
        )
        const updatedUser = await this.userService.updateTelegramIdOnly(
          linkToUserId,
          telegramUser.telegram_id,
        )

        const token = await this.authService.login(updatedUser)
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
        return res.redirect(
          `${frontendUrl}/auth/callback?accessToken=${token.accessToken}&refreshToken=${token.refreshToken}`,
        )
      }

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

    // No existing user found, create new one
    this.logger.log(
      `${providerName} authentication: Creating new user with ${providerName} ID`,
    )
    const newUser = await this.userService.create(
      this.createDefaultUserData(userData),
    )

    await this.createClickerProfile(newUser.id)

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
   * Creates clicker profile for new user
   */
  private async createClickerProfile(userId: number): Promise<void> {
    await this.clickerUserService.create({
      user_id: userId,
      level: 1,
      click_level: 1,
      energy_level: 1,
      energy_amount: 100,
      points: 0,
    })
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
