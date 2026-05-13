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
import { Throttle } from '@nestjs/throttler'
import { UserService } from './users.service'
import type { SteamProfileBonusType } from './users.service'
import { TelegramService } from '../social/services/telegram.service'
import { AuthGuard } from '@nestjs/passport'
import { Request, Response } from 'express'
import { User } from './user.entity'
import { UserThrottlerGuard } from '../../core/guards/user-throttler.guard'
import { AdminJwtGuard } from '../admin/guards/admin-jwt.guard'
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard'
import { AdminRoles } from '../admin/decorators/admin-roles.decorator'
import { AdminRole } from '../admin/types/admin-role.enum'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger'
import { setSteamLinkStateCookie } from '../auth/steam-link-state'

/**
 * Controller for working with users
 * @class UserController
 */

@ApiTags('users')
@Controller('users')
export class UserController {
  private readonly logger = new Logger(UserController.name)
  private static readonly MAX_TELEGRAM_SUBSCRIPTION_BONUS_AMOUNT = 1

  constructor(
    private readonly userService: UserService,
    private readonly telegramService: TelegramService,
  ) { }

  private getTelegramSubscriptionBonusAmount(): number {
    const bonusAmount = Number(
      process.env.TELEGRAM_SUBSCRIPTION_BONUS_AMOUNT || '0.05',
    )

    if (
      !Number.isFinite(bonusAmount) ||
      bonusAmount <= 0 ||
      bonusAmount > UserController.MAX_TELEGRAM_SUBSCRIPTION_BONUS_AMOUNT
    ) {
      throw new BadRequestException(
        'Telegram subscription bonus is not configured',
      )
    }

    return bonusAmount
  }

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

  @ApiOperation({ summary: 'Get current user deposit history' })
  @ApiResponse({
    status: 200,
    description: 'Return current user deposit history ordered newest first',
  })
  @UseGuards(AuthGuard('jwt'))
  @Get('me/deposits')
  async getMyDeposits(@Req() req: Request) {
    const user = req.user as User
    return this.userService.getDepositHistory(user.id)
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

  @ApiOperation({ summary: 'Get Steam profile bonus status' })
  @ApiResponse({
    status: 200,
    description: 'Steam avatar and nickname bonus verification status',
  })
  @UseGuards(AuthGuard('jwt'))
  @Get('me/steam-profile-bonus/status')
  async getSteamProfileBonusStatus(@Req() req: Request) {
    const user = req.user as User
    return this.userService.getSteamProfileBonusStatus(user.id)
  }

  @ApiOperation({
    summary:
      'Verify Steam profile bonus and reduce Bonus Wheel cooldown once by 6 hours',
  })
  @ApiResponse({
    status: 200,
    description: 'Steam profile bonus verified successfully',
  })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseGuards(AuthGuard('jwt'), UserThrottlerGuard)
  @Post('me/steam-profile-bonus/:type/claim')
  async claimSteamProfileBonus(
    @Param('type') type: SteamProfileBonusType,
    @Req() req: Request,
  ) {
    if (type !== 'avatar' && type !== 'nickname') {
      throw new BadRequestException('Invalid Steam profile bonus type')
    }

    const user = req.user as User
    const result = await this.userService.claimSteamProfileBonus(user.id, type)

    return {
      message: 'Steam profile bonus verified successfully',
      status: result.status,
      cooldown_reduced_seconds: result.cooldownReducedSeconds,
      user: {
        id: result.user.id,
        avatar: result.user.avatar,
        display_name: result.user.display_name,
        steam_id: result.user.steam_id,
      },
    }
  }

  @ApiOperation({ summary: 'Get Telegram subscription bonus status' })
  @ApiResponse({
    status: 200,
    description: 'Return Telegram link, claim state and configured bonus amount',
  })
  @UseGuards(AuthGuard('jwt'))
  @Get('me/telegram-subscription-bonus/status')
  getTelegramSubscriptionBonusStatus(@Req() req: Request) {
    const user = req.user as User

    return {
      isLinked: Boolean(user.telegram_user_id),
      isClaimed: Boolean(user.telegram_bonus_claimed),
      bonusAmount: this.getTelegramSubscriptionBonusAmount(),
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
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseGuards(AuthGuard('jwt'), UserThrottlerGuard)
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

      const bonusAmount = this.getTelegramSubscriptionBonusAmount()

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
      // out. No user input, no query param - the callback can't be
      // tricked into linking to a different account.
      setSteamLinkStateCookie(res, user.id)

      const baseUrl = process.env.BASE_URL || 'http://localhost:5000'
      // No query param - the cookie carries the linking intent. The
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


}
