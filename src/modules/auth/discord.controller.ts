import {
  BadRequestException,
  Controller,
  Get,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import type { Request, Response } from 'express'
import { UserThrottlerGuard } from '../../core/guards/user-throttler.guard'
import { DiscordService } from '../social/services/discord.service'
import { User } from '../users/user.entity'
import { UserService } from '../users/users.service'
import {
  clearDiscordLinkStateCookie,
  readDiscordLinkStateCookie,
  setDiscordLinkStateCookie,
} from './discord-link-state'

interface RequestWithUser extends Omit<Request, 'user'> {
  user: User
}

type AuthErrorReason =
  | 'already_linked'
  | 'session_expired'
  | 'invalid_credentials'
  | 'unknown'

const frontendBase = () => process.env.FRONTEND_URL || 'http://localhost:3000'
const successUrl = () =>
  `${frontendBase()}/auth/callback?action=link&provider=discord`
const errorUrl = (reason: AuthErrorReason) =>
  `${frontendBase()}/auth/error?action=link&provider=discord&reason=${reason}`

const mapErrorToReason = (err: unknown): AuthErrorReason => {
  const message = err instanceof Error ? err.message.toLowerCase() : ''
  if (message.includes('already linked')) return 'already_linked'
  if (
    message.includes('expired') ||
    message.includes('state') ||
    message.includes('not authenticated')
  ) {
    return 'session_expired'
  }
  if (
    message.includes('invalid') ||
    message.includes('missing discord_client') ||
    message.includes('could not verify discord')
  ) {
    return 'invalid_credentials'
  }
  return 'unknown'
}

@Controller('discord')
@UseGuards(ThrottlerGuard)
export class DiscordController {
  private readonly logger = new Logger(DiscordController.name)

  constructor(
    private readonly userService: UserService,
    private readonly discordService: DiscordService,
  ) {}

  @Get('auth-url')
  @UseGuards(AuthGuard('jwt'))
  async getAuthUrl(
    @Req() req: RequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ url: string }> {
    const user = req.user
    if (user.discord_user_id) {
      throw new BadRequestException(
        'Discord account is already linked to this user',
      )
    }

    const state = setDiscordLinkStateCookie(res, user.id)
    return { url: this.discordService.buildAuthorizeUrl(state) }
  }

  @Get('status')
  @UseGuards(AuthGuard('jwt'))
  async getStatus(@Req() req: RequestWithUser): Promise<DiscordStatusResponse> {
    const user = req.user

    return {
      isLinked: Boolean(user.discord_user_id),
      isSubscribed: Boolean(user.discord_bonus_claimed),
      isClaimed: Boolean(user.discord_bonus_claimed),
      discordId: user.discord_user_id ?? undefined,
      username: user.discord_username ?? undefined,
      bonusAmount: this.discordService.getSubscriptionBonusAmount(),
      inviteUrl: this.discordService.getInviteUrl(),
    }
  }

  @Post('subscription-bonus')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseGuards(AuthGuard('jwt'), UserThrottlerGuard)
  async claimSubscriptionBonus(@Req() req: RequestWithUser): Promise<{
    message: string
    balance: number
    bonus_amount: number
  }> {
    const user = req.user

    if (!user.discord_user_id) {
      throw new BadRequestException(
        'Discord account is not linked. Please link your Discord account first.',
      )
    }

    if (user.discord_bonus_claimed) {
      throw new BadRequestException(
        'Discord subscription bonus has already been claimed',
      )
    }

    const isMember = await this.discordService.checkGuildMembership(
      user.discord_user_id,
    )
    if (!isMember) {
      throw new BadRequestException(
        'You are not subscribed to our Discord server. Please join and try again.',
      )
    }

    const bonusAmount = this.discordService.getSubscriptionBonusAmount()
    const updatedUser = await this.userService.claimDiscordSubscriptionBonus(
      user.id,
      bonusAmount,
    )

    return {
      message: 'Discord subscription bonus claimed successfully',
      balance: updatedUser.balance,
      bonus_amount: bonusAmount,
    }
  }
}

@Controller('auth/discord')
@UseGuards(ThrottlerGuard)
export class DiscordAuthController {
  private readonly logger = new Logger(DiscordAuthController.name)

  constructor(
    private readonly userService: UserService,
    private readonly discordService: DiscordService,
  ) {}

  @Get('callback')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const linkingUserId = readDiscordLinkStateCookie(req, state)
    clearDiscordLinkStateCookie(res)

    if (!code || !state || linkingUserId === null) {
      return res.redirect(errorUrl('session_expired'))
    }

    try {
      const discordUser = await this.discordService.exchangeCodeForUser(code)
      await this.userService.updateDiscordAccount(linkingUserId, discordUser)
      return res.redirect(successUrl())
    } catch (err: unknown) {
      this.logger.warn(
        `Discord link failed for user ${linkingUserId}: ${
          err instanceof Error ? err.message : 'Unknown error'
        }`,
      )

      return res.redirect(errorUrl(mapErrorToReason(err)))
    }
  }
}

interface DiscordStatusResponse {
  isLinked: boolean
  isSubscribed: boolean
  isClaimed: boolean
  discordId?: string
  username?: string
  bonusAmount: number
  inviteUrl: string
}
