import { Injectable, UnauthorizedException, Logger } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ConfigService } from '@nestjs/config'
import { Strategy } from 'passport-steam'
import { ERROR_MESSAGES } from '../../constants/errorMessages'

import type { SteamAuthResult } from './types/auth.types'

interface SteamProfile {
  id: string
  displayName?: string
  photos?: { value: string }[]
  _json?: {
    profileurl?: string
  }
}

/**
 * Steam authentication strategy
 * @class SteamStrategy
 * @extends {PassportStrategy}
 */

@Injectable()
export class SteamStrategy extends PassportStrategy(Strategy, 'steam') {
  private readonly logger = new Logger(SteamStrategy.name)

  constructor(private readonly configService: ConfigService) {
    const baseUrl = configService.get<string>(
      'BASE_URL',
      'http://localhost:5000',
    )
    const steamApiKey = configService.get<string>('STEAM_API_KEY')

    super({
      returnURL: `${baseUrl}/auth/steam/return`,
      realm: baseUrl,
      apiKey: steamApiKey,
      profile: true,
    })

    this.logger.log(
      `Initializing Steam strategy with returnURL: ${baseUrl}/auth/steam/return`,
    )
    this.logger.log(
      `Using Steam API key: ${steamApiKey ? 'Present' : 'Missing'}`,
    )
  }

  async validate(
    _identifier: string,
    profile: SteamProfile,
  ): Promise<SteamAuthResult> {
    try {
      if (!profile || !profile.id) {
        this.logger.warn('Invalid Steam profile received')
        throw new UnauthorizedException(ERROR_MESSAGES.AUTH.INVALID_CREDENTIALS)
      }

      this.logger.log(`Steam authentication successful for user ${profile.id}`)
      return {
        steam_id: profile.id,
        display_name: profile.displayName || '',
        avatar: profile.photos?.[2]?.value || null,
        profile_url: profile._json?.profileurl || null,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      this.logger.error(`Steam authentication error: ${message}`)
      throw error
    }
  }
}
