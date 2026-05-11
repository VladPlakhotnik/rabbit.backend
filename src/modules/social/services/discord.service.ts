import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'

/**
 * Service for working with Discord API
 * @class DiscordService
 */
@Injectable()
export class DiscordService {
  private readonly logger = new Logger(DiscordService.name)

  constructor(private readonly httpService: HttpService) {}

  buildAuthorizeUrl(state: string): string {
    const clientId = this.requireEnv('DISCORD_CLIENT_ID')
    const redirectUri = this.getRedirectUri()
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'identify',
      state,
    })

    return `https://discord.com/oauth2/authorize?${params.toString()}`
  }

  async exchangeCodeForUser(code: string): Promise<DiscordUserProfile> {
    const accessToken = await this.exchangeCodeForAccessToken(code)
    return this.fetchCurrentUser(accessToken)
  }

  async checkGuildMembership(discordUserId: string): Promise<boolean> {
    const botToken = this.requireEnv('DISCORD_BOT_TOKEN')
    const guildId = this.normalizeSnowflake(
      this.requireEnv('DISCORD_GUILD_ID'),
      'Discord guild ID',
    )
    const safeUserId = this.normalizeSnowflake(discordUserId, 'Discord user ID')

    try {
      await firstValueFrom(
        this.httpService.get(
          `https://discord.com/api/v10/guilds/${guildId}/members/${safeUserId}`,
          {
            headers: {
              Authorization: `Bot ${botToken}`,
            },
            timeout: 8000,
          },
        ),
      )

      return true
    } catch (err: unknown) {
      const status = this.getHttpStatus(err)
      if (status === 404) {
        const botCanReadGuild = await this.canBotReadGuild(guildId, botToken)
        if (!botCanReadGuild) {
          throw new ServiceUnavailableException(
            'Discord bot is not connected to the configured server',
          )
        }

        return false
      }

      if (status === 401 || status === 403) {
        this.logger.warn(
          `Discord membership check rejected by Discord API: status=${status}`,
        )
        throw new ServiceUnavailableException(
          'Discord bot is not configured to verify this server',
        )
      }

      this.logger.warn(
        `Discord membership check failed: ${
          err instanceof Error ? err.message : 'Unknown error'
        }`,
      )
      throw new ServiceUnavailableException(
        'Could not verify Discord subscription right now',
      )
    }
  }

  private async canBotReadGuild(
    guildId: string,
    botToken: string,
  ): Promise<boolean> {
    try {
      await firstValueFrom(
        this.httpService.get(`https://discord.com/api/v10/guilds/${guildId}`, {
          headers: {
            Authorization: `Bot ${botToken}`,
          },
          timeout: 8000,
        }),
      )

      return true
    } catch (err: unknown) {
      const status = this.getHttpStatus(err)
      if (status === 403 || status === 404) return false
      if (status === 401) {
        throw new ServiceUnavailableException(
          'Discord bot token is not configured correctly',
        )
      }

      throw new ServiceUnavailableException(
        'Could not verify Discord server configuration right now',
      )
    }
  }

  getInviteUrl(): string {
    return process.env.DISCORD_INVITE_URL || ''
  }

  getSubscriptionBonusAmount(): number {
    const amount = Number(process.env.DISCORD_SUBSCRIPTION_BONUS_AMOUNT || '0.05')

    if (!Number.isFinite(amount) || amount <= 0 || amount > 1) {
      throw new BadRequestException(
        'Discord subscription bonus is not configured',
      )
    }

    return amount
  }

  private async exchangeCodeForAccessToken(code: string): Promise<string> {
    const clientId = this.requireEnv('DISCORD_CLIENT_ID')
    const clientSecret = this.requireEnv('DISCORD_CLIENT_SECRET')
    const redirectUri = this.getRedirectUri()
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    })

    try {
      const response = await firstValueFrom(
        this.httpService.post<DiscordTokenResponse>(
          'https://discord.com/api/v10/oauth2/token',
          body.toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            timeout: 8000,
          },
        ),
      )

      if (!response.data.access_token) {
        throw new BadRequestException('Discord did not return an access token')
      }

      return response.data.access_token
    } catch (err: unknown) {
      if (err instanceof BadRequestException) throw err

      this.logger.warn(
        `Discord OAuth token exchange failed: ${
          err instanceof Error ? err.message : 'Unknown error'
        }`,
      )
      throw new BadRequestException('Could not verify Discord account')
    }
  }

  private async fetchCurrentUser(
    accessToken: string,
  ): Promise<DiscordUserProfile> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<DiscordUserProfile>(
          'https://discord.com/api/v10/users/@me',
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            timeout: 8000,
          },
        ),
      )

      if (!response.data.id || !response.data.username) {
        throw new BadRequestException('Discord profile is incomplete')
      }

      return response.data
    } catch (err: unknown) {
      if (err instanceof BadRequestException) throw err

      this.logger.warn(
        `Discord profile fetch failed: ${
          err instanceof Error ? err.message : 'Unknown error'
        }`,
      )
      throw new BadRequestException('Could not verify Discord account')
    }
  }

  private getRedirectUri(): string {
    return (
      process.env.DISCORD_OAUTH_REDIRECT_URL ||
      `${process.env.BASE_URL || 'http://localhost:5000'}/auth/discord/callback`
    )
  }

  private requireEnv(key: string): string {
    const value = process.env[key]
    if (!value || value.trim() === '') {
      throw new BadRequestException(`Missing ${key}`)
    }
    return value.trim()
  }

  private normalizeSnowflake(value: string, label: string): string {
    const trimmed = value.trim()
    if (!/^\d{5,30}$/.test(trimmed)) {
      throw new BadRequestException(`${label} is invalid`)
    }
    return trimmed
  }

  private getHttpStatus(err: unknown): number | undefined {
    if (
      typeof err === 'object' &&
      err !== null &&
      'response' in err &&
      typeof (err as { response?: { status?: unknown } }).response?.status ===
        'number'
    ) {
      return (err as { response: { status: number } }).response.status
    }

    return undefined
  }
}

export interface DiscordUserProfile {
  id: string
  username: string
  global_name?: string | null
  avatar?: string | null
}

interface DiscordTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  scope: string
}
