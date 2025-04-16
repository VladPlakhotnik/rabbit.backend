import { Injectable, UnauthorizedException, Logger } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { Strategy } from 'passport-steam'
import { ERROR_MESSAGES } from '../../constants/errorMessages'

interface SteamProfile {
  id: string
  displayName?: string
  photos?: { value: string }[]
  _json?: {
    profileurl?: string
  }
}

interface SteamAuthResult {
  steam_id: string
  display_name: string
  avatar: string | null
  profile_url: string | null
}

/**
 * Steam authentication strategy
 * @class SteamStrategy
 * @extends {PassportStrategy}
 */

@Injectable()
export class SteamStrategy extends PassportStrategy(Strategy, 'steam') {
  private readonly logger = new Logger(SteamStrategy.name)

  constructor() {
    super({
      returnURL: `${process.env.BASE_URL}/auth/steam/return`,
      realm: process.env.BASE_URL,
      apiKey: process.env.STEAM_API_KEY,
    })
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
