import { Injectable, UnauthorizedException, Logger } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { Request } from 'express'
import { TelegramService } from '../social/services/telegram.service'
import { ERROR_MESSAGES } from '../../constants/errorMessages'
import type { TelegramAuthResult } from './types/auth.types'

// passport-custom doesn't have TypeScript definitions, so we use dynamic import
 
const Strategy = require('passport-custom')

interface TelegramAuthData {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
}

/**
 * Telegram authentication strategy
 * @class TelegramStrategy
 * @extends {PassportStrategy}
 */
@Injectable()
export class TelegramStrategy extends PassportStrategy(Strategy, 'telegram') {
  private readonly logger = new Logger(TelegramStrategy.name)

  constructor(private readonly telegramService: TelegramService) {
    super()
    this.logger.log('Initializing Telegram strategy')
  }

  async validate(req: Request): Promise<TelegramAuthResult> {
    try {
      // Telegram Login Widget sends data via query parameters
      const query = req.query
      const authData: TelegramAuthData = {
        id: query.id ? parseInt(query.id as string, 10) : 0,
        first_name: query.first_name as string | undefined,
        last_name: query.last_name as string | undefined,
        username: query.username as string | undefined,
        photo_url: query.photo_url as string | undefined,
        auth_date: query.auth_date
          ? parseInt(query.auth_date as string, 10)
          : 0,
        hash: query.hash as string,
      }

      if (!authData.id || !authData.hash) {
        this.logger.warn('Invalid Telegram auth data received')
        throw new UnauthorizedException(ERROR_MESSAGES.AUTH.INVALID_CREDENTIALS)
      }

      // Verify Telegram authentication data
      const telegramUserId = await this.telegramService.verifyAuthData(authData)

      // Build display name
      const displayName = authData.first_name
        ? authData.last_name
          ? `${authData.first_name} ${authData.last_name}`
          : authData.first_name
        : authData.username || 'Telegram User'

      this.logger.log(
        `Telegram authentication successful for user ${telegramUserId}`,
      )

      return {
        telegram_id: telegramUserId,
        display_name: displayName,
        avatar: authData.photo_url || null,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      this.logger.error(`Telegram authentication error: ${message}`)
      throw error
    }
  }
}
