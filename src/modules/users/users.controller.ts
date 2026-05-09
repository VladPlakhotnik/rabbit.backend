import {
  Controller,
  Get,
  Param,
  NotFoundException,
  UseGuards,
  Req,
  Res,
  Patch,
  Body,
  BadRequestException,
  Logger,
  Post,
} from '@nestjs/common'
import { UserService } from './users.service'
import { TelegramService } from '../social/services/telegram.service'
import { AuthGuard } from '@nestjs/passport'
import { Request, Response } from 'express'
import { User } from './user.entity'
import { AdminJwtGuard } from '../admin/guards/admin-jwt.guard'
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard'
import { AdminRoles } from '../admin/decorators/admin-roles.decorator'
import { AdminRole } from '../admin/types/admin-role.enum'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger'
import { setSteamLinkStateCookie } from '../auth/steam-link-state'
import { setGoogleLinkStateCookie } from '../auth/google-link-state'

/**
 * Controller for working with users
 * @class UserController
 */

@ApiTags('users')
@Controller('users')
export class UserController {
  private readonly logger = new Logger(UserController.name)

  constructor(
    private readonly userService: UserService,
    private readonly telegramService: TelegramService,
  ) { }

  @ApiOperation({ summary: 'Get all users (admin panel)' })
  @ApiResponse({ status: 200, description: 'Return all users' })
  @ApiBearerAuth()
  @UseGuards(AdminJwtGuard, AdminRolesGuard)
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.MANAGER, AdminRole.VIEWER)
  @Get()
  async findAll() {
    const users = await this.userService.findAll()
    return users
  }

  @ApiOperation({ summary: 'Get user profile' })
  @ApiResponse({ status: 200, description: 'Return user profile' })
  @UseGuards(AuthGuard('jwt'))
  //@UseGuards(AuthGuardNest)
  @Get('me')
  async getProfile(@Req() req: Request) {
    return req.user
  }

  @ApiOperation({ summary: 'Get user by ID' })
  @ApiResponse({ status: 200, description: 'Return user by ID' })
  //@UseGuards(AuthGuard('jwt'))
  @Get(':id')
  async findOne(@Param('id') id: number) {
    const user = await this.userService.findById(id)
    if (!user) {
      throw new NotFoundException('User not found')
    }

    const { balance, ...userWithoutBalance } = user
    return userWithoutBalance
  }

  @ApiOperation({ summary: 'Update user trade link' })
  @ApiResponse({ status: 200, description: 'Return updated user trade link' })
  @UseGuards(AuthGuard('jwt'))
  @Patch('me/trade-link')
  async updateTradeLink(
    @Req() req: Request,
    @Body('trade_link') tradeLink: string,
  ) {
    const user = req.user as User

    if (!tradeLink) {
      throw new BadRequestException('Trade link is required')
    }

    await this.userService.updateTradeLink(user.id, tradeLink)

    return { message: 'Trade link updated successfully' }
  }

  @ApiOperation({ summary: 'Update current user Steam display name' })
  @ApiResponse({
    status: 200,
    description: 'Steam display name updated successfully',
  })
  @UseGuards(AuthGuard('jwt'))
  @Patch('me/steam-name')
  async updateSteamDisplayName(@Req() req: Request) {
    try {
      const user = req.user as User

      if (!user.steam_id) {
        throw new BadRequestException('Steam ID not found')
      }

      const updatedUser = await this.userService.updateSteamDisplayName(user.id)

      return {
        message: 'Steam display name updated successfully',
        user: {
          id: updatedUser.id,
          display_name: updatedUser.display_name,
          steam_id: updatedUser.steam_id,
        },
      }
    } catch (error: unknown) {
      this.logger.error(
        `Error updating Steam display name for user ${req.user?.id}: ${error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
      throw error
    }
  }

  @ApiOperation({ summary: 'Update current user Steam avatar' })
  @ApiResponse({
    status: 200,
    description: 'Steam avatar updated successfully',
  })
  @UseGuards(AuthGuard('jwt'))
  @Patch('me/steam-avatar')
  async updateSteamAvatar(@Req() req: Request) {
    try {
      const user = req.user as User

      if (!user.steam_id) {
        throw new BadRequestException('Steam ID not found')
      }

      const updatedUser = await this.userService.updateSteamAvatar(user.id)

      return {
        message: 'Steam avatar updated successfully',
        user: {
          id: updatedUser.id,
          avatar: updatedUser.avatar,
          steam_id: updatedUser.steam_id,
        },
      }
    } catch (error) {
      this.logger.error(
        `Error updating Steam avatar for user ${req.user?.id}: ${error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
      throw error
    }
  }

  @ApiOperation({ summary: 'Claim Telegram subscription bonus' })
  @ApiResponse({
    status: 200,
    description: 'Telegram subscription bonus claimed successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'User is not subscribed or bonus already claimed',
  })
  @UseGuards(AuthGuard('jwt'))
  @Post('me/telegram-subscription-bonus')
  async claimTelegramSubscriptionBonus(@Req() req: Request) {
    try {
      const user = req.user as User

      // Check if Telegram account is linked
      if (!user.telegram_user_id) {
        throw new BadRequestException(
          'Telegram account is not linked. Please link your Telegram account first.',
        )
      }

      if (user.telegram_bonus_claimed) {
        throw new BadRequestException(
          'Telegram subscription bonus has already been claimed',
        )
      }

      // Check if user is subscribed to the Telegram channel
      const isSubscribed = await this.telegramService.checkSubscription(
        user.telegram_user_id,
      )

      if (!isSubscribed) {
        throw new BadRequestException(
          'You are not subscribed to our Telegram channel. Please subscribe and try again.',
        )
      }

      // Get bonus amount from environment variable (default: $0.50)
      const bonusAmount = parseFloat(
        process.env.TELEGRAM_SUBSCRIPTION_BONUS_AMOUNT || '0.50',
      )

      if (bonusAmount <= 0) {
        throw new BadRequestException(
          'Telegram subscription bonus is not configured',
        )
      }

      // Claim the bonus
      const updatedUser = await this.userService.claimTelegramSubscriptionBonus(
        user.id,
        bonusAmount,
      )

      return {
        message: 'Telegram subscription bonus claimed successfully',
        balance: updatedUser.balance,
        bonus_amount: bonusAmount,
      }
    } catch (error: unknown) {
      this.logger.error(
        `Error claiming Telegram subscription bonus for user ${req.user?.id}: ${error instanceof Error ? error.message : 'Unknown error'
        }`,
      )

      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error
      }

      throw new BadRequestException(
        'Failed to claim Telegram subscription bonus. Please try again later.',
      )
    }
  }

  @ApiOperation({
    summary:
      'Begin Steam-account linking. Sets a short-lived signed state cookie that ties the next /auth/steam round-trip to the JWT-authenticated caller, then returns the URL to redirect the browser to. Replaces the old `?link_to_user_id=` flow which let any caller specify the destination user (account-takeover hole).',
  })
  @ApiResponse({ status: 200, description: 'auth_url returned, state cookie set' })
  @ApiResponse({ status: 400, description: 'Steam already linked' })
  @UseGuards(AuthGuard('jwt'))
  @Get('me/link/steam')
  async getSteamLinkUrl(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const user = req.user as User

      if (user.steam_id) {
        throw new BadRequestException(
          'Steam account is already linked to this user',
        )
      }

      // The state cookie carries (user_id, nonce, exp) HMAC-signed with
      // the refresh secret. The Steam callback reads it back, verifies
      // the signature, and trusts the user_id only if everything checks
      // out. No user input, no query param — the callback can't be
      // tricked into linking to a different account.
      setSteamLinkStateCookie(res, user.id)

      const baseUrl = process.env.BASE_URL || 'http://localhost:5000'
      // No query param — the cookie carries the linking intent. The
      // /auth/steam handler kicks off the OpenID dance regardless;
      // /auth/steam/return reads the cookie to decide sign-in vs link.
      const steamAuthUrl = `${baseUrl}/auth/steam`

      return {
        message: 'Steam OAuth URL generated',
        auth_url: steamAuthUrl,
        instructions:
          'Visit this URL within 5 minutes to link your Steam account.',
      }
    } catch (error: unknown) {
      this.logger.error(
        `Error generating Steam link URL for user ${req.user?.id}: ${error instanceof Error ? error.message : 'Unknown error'
        }`,
      )

      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error
      }

      throw new BadRequestException(
        'Failed to generate Steam link URL. Please try again later.',
      )
    }
  }

  @ApiOperation({ summary: 'Link Steam account to current user (direct)' })
  @ApiResponse({
    status: 200,
    description: 'Steam account linked successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Steam account already linked to another user',
  })
  @UseGuards(AuthGuard('jwt'))
  @Post('me/link/steam')
  async linkSteamAccount(
    @Req() req: Request,
    @Body() body: { steam_id: string | number },
  ) {
    try {
      const user = req.user as User

      if (!body.steam_id) {
        throw new BadRequestException('Steam ID is required')
      }

      // Check if user already has Steam account linked
      if (user.steam_id) {
        throw new BadRequestException(
          'Steam account is already linked to this user',
        )
      }

      // Check if Steam account is already linked to another user
      const existingUser = await this.userService.findBySteamId(body.steam_id)
      if (existingUser && existingUser.id !== user.id) {
        throw new BadRequestException(
          'This Steam account is already linked to another user',
        )
      }

      // Update only Steam ID without changing other user data
      const updatedUser = await this.userService.updateSteamIdOnly(
        user.id,
        body.steam_id,
      )

      return {
        message: 'Steam account linked successfully',
        user: {
          id: updatedUser.id,
          steam_id: updatedUser.steam_id,
        },
      }
    } catch (error: unknown) {
      this.logger.error(
        `Error linking Steam account for user ${req.user?.id}: ${error instanceof Error ? error.message : 'Unknown error'
        }`,
      )

      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error
      }

      throw new BadRequestException(
        'Failed to link Steam account. Please try again later.',
      )
    }
  }

  @ApiOperation({
    summary:
      'Begin Google-account linking. Sets a short-lived signed state cookie that ties the next /auth/google round-trip to the JWT-authenticated caller, then returns the URL to redirect the browser to. Same shape as /users/me/link/steam — see that endpoint for the rationale.',
  })
  @ApiResponse({ status: 200, description: 'auth_url returned, state cookie set' })
  @ApiResponse({ status: 400, description: 'Google already linked' })
  @UseGuards(AuthGuard('jwt'))
  @Get('me/link/google')
  async getGoogleLinkUrl(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const user = req.user as User

      if (user.google_id) {
        throw new BadRequestException(
          'Google account is already linked to this user',
        )
      }

      // The state cookie carries (user_id, nonce, exp) HMAC-signed with
      // the refresh secret. The Google callback reads it back, verifies
      // the signature, and trusts the user_id only if everything checks
      // out. No user input, no query param.
      setGoogleLinkStateCookie(res, user.id)

      const baseUrl = process.env.BASE_URL || 'http://localhost:5000'
      const googleAuthUrl = `${baseUrl}/auth/google`

      return {
        message: 'Google OAuth URL generated',
        auth_url: googleAuthUrl,
        instructions:
          'Visit this URL within 5 minutes to link your Google account.',
      }
    } catch (error: unknown) {
      this.logger.error(
        `Error generating Google link URL for user ${req.user?.id}: ${error instanceof Error ? error.message : 'Unknown error'
        }`,
      )

      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error
      }

      throw new BadRequestException(
        'Failed to generate Google link URL. Please try again later.',
      )
    }
  }

  // GET /users/me/link/telegram and POST /users/me/link/telegram were
  // removed as part of the Telegram-auth security overhaul. Both relied
  // on `?link_to_user_id=` (unauthenticated query input) or accepted a
  // raw `telegram_user_id` from request body without HMAC verification —
  // either path let any caller attach an arbitrary Telegram id to their
  // own account, or attach their Telegram to anyone's account. The
  // canonical replacement is POST /auth/telegram/link, which requires
  // JWT and the full HMAC-signed Telegram payload. See
  // src/modules/auth/auth.controller.ts → linkTelegram.

}
