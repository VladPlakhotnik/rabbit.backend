import { Injectable, BadRequestException, Logger } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'
import * as crypto from 'crypto'

interface TelegramChatMember {
  status:
    | 'creator'
    | 'administrator'
    | 'member'
    | 'restricted'
    | 'left'
    | 'kicked'
  user: {
    id: number
    is_bot: boolean
    first_name: string
    username?: string
  }
}

interface TelegramApiResponse<T> {
  ok: boolean
  result?: T
  description?: string
  error_code?: number
}

/**
 * Service for working with Telegram Bot API
 * @class TelegramService
 */
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name)
  private readonly botToken: string
  private readonly channelChatId: string
  private readonly baseUrl: string

  constructor(private readonly httpService: HttpService) {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN || ''
    this.channelChatId = process.env.TELEGRAM_CHANNEL_CHAT_ID || ''

    if (!this.botToken) {
      this.logger.warn('TELEGRAM_BOT_TOKEN is not set in environment variables')
    }

    if (!this.channelChatId) {
      this.logger.warn(
        'TELEGRAM_CHANNEL_CHAT_ID is not set in environment variables',
      )
    }

    this.baseUrl = `https://api.telegram.org/bot${this.botToken}`
  }

  /**
   * Check if user is subscribed to the Telegram channel
   * @param telegramUserId - Telegram user ID
   * @returns true if user is subscribed, false otherwise
   */
  async checkSubscription(telegramUserId: number): Promise<boolean> {
    if (!this.botToken || !this.channelChatId) {
      throw new BadRequestException(
        'Telegram bot configuration is not set. Please contact administrator.',
      )
    }

    try {
      const url = `${this.baseUrl}/getChatMember`
      const response = await firstValueFrom(
        this.httpService.get<TelegramApiResponse<TelegramChatMember>>(url, {
          params: {
            chat_id: this.channelChatId,
            user_id: telegramUserId,
          },
        }),
      )

      if (!response.data.ok) {
        this.logger.error(
          `Telegram API error: ${response.data.description || 'Unknown error'}`,
        )
        throw new BadRequestException(
          `Failed to check subscription: ${
            response.data.description || 'Unknown error'
          }`,
        )
      }

      const member = response.data.result
      if (!member) {
        return false
      }

      // User is considered subscribed if status is 'creator', 'administrator', or 'member'
      const subscribedStatuses: TelegramChatMember['status'][] = [
        'creator',
        'administrator',
        'member',
      ]

      return subscribedStatuses.includes(member.status)
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        throw error
      }

      this.logger.error(
        `Error checking Telegram subscription: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )

      // If user is not found (404), they are not subscribed
      if (
        error &&
        typeof error === 'object' &&
        'response' in error &&
        error.response &&
        typeof error.response === 'object' &&
        'status' in error.response &&
        error.response.status === 400
      ) {
        return false
      }

      throw new BadRequestException(
        `Failed to verify subscription. Please make sure you are subscribed to the channel and try again.`,
      )
    }
  }

  /**
   * Verify Telegram authentication data from Login Widget
   * @param authData - Authentication data from Telegram widget
   * @returns Telegram user ID if verification successful
   */
  verifyAuthData(authData: {
    id: number
    first_name?: string
    last_name?: string
    username?: string
    photo_url?: string
    auth_date: number
    hash: string
  }): number {
    if (!this.botToken) {
      throw new BadRequestException('Telegram bot token is not configured')
    }

    // Check if auth_date is not too old (24 hours)
    const authDate = authData.auth_date
    const currentTime = Math.floor(Date.now() / 1000)
    const maxAge = 24 * 60 * 60 // 24 hours

    if (currentTime - authDate > maxAge) {
      throw new BadRequestException('Telegram authentication data has expired')
    }

    // Extract hash from auth data
    const { hash, ...dataWithoutHash } = authData

    // Create data check string
    const dataCheckString = Object.keys(dataWithoutHash)
      .sort()
      .map(
        key => `${key}=${dataWithoutHash[key as keyof typeof dataWithoutHash]}`,
      )
      .join('\n')

    // Create secret key from bot token
    const secretKey = crypto.createHash('sha256').update(this.botToken).digest()

    // Calculate HMAC
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex')

    // Verify hash
    if (calculatedHash !== hash) {
      throw new BadRequestException(
        'Invalid Telegram authentication data. Hash verification failed.',
      )
    }

    return authData.id
  }
}
