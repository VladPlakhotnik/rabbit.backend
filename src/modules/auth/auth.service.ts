import { Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { User } from '../users/user.entity'
import {
  ACCESS_TOKEN_EXPIRES,
  REFRESH_TOKEN_EXPIRES,
} from '../../constants/common'
import { ERROR_MESSAGES } from '../../constants/errorMessages'
import type { TokenResponse, RefreshTokenResponse } from './types/auth.types'

export interface JwtPayload {
  steam_id?: number | string | null
  telegram_id?: number | string | null
  google_id?: string | null
  sub: number
  iat?: number
  exp?: number
}

/**
 * Service for authentication
 * @class AuthService
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(private readonly jwtService: JwtService) {}

  async login(user: User): Promise<TokenResponse> {
    const payload: JwtPayload = {
      steam_id: user.steam_id ?? null,
      telegram_id: user.telegram_user_id ?? null,
      google_id: user.google_id ?? null,
      sub: user.id,
    }

    // Generate access token (short-lived) and refresh token (long-lived)
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.sign(payload, { expiresIn: ACCESS_TOKEN_EXPIRES }),
      this.jwtService.sign(payload, { expiresIn: REFRESH_TOKEN_EXPIRES }),
    ])

    this.logger.log(`Generated tokens for user ${user.id}`)

    return { accessToken, refreshToken }
  }

  async refreshToken(refreshToken: string): Promise<RefreshTokenResponse> {
    if (!refreshToken) {
      this.logger.warn('Refresh token refresh attempted with empty token')
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.INVALID_REFRESH_TOKEN)
    }

    try {
      // Check if the refresh token is valid
      const payload = this.jwtService.verify(refreshToken) as JwtPayload

      if (!payload.sub) {
        this.logger.warn('Refresh token missing user ID (sub)')
        throw new UnauthorizedException(
          ERROR_MESSAGES.AUTH.INVALID_REFRESH_TOKEN,
        )
      }

      // Generate new access token
      const newAccessToken = this.jwtService.sign(
        {
          steam_id: payload.steam_id ?? null,
          telegram_id: payload.telegram_id ?? null,
          google_id: payload.google_id ?? null,
          sub: payload.sub,
        },
        { expiresIn: ACCESS_TOKEN_EXPIRES },
      )

      this.logger.log(`Refreshed access token for user ${payload.sub}`)
      return { accessToken: newAccessToken }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      this.logger.error(`Token refresh failed: ${errorMessage}`)
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.INVALID_REFRESH_TOKEN)
    }
  }
}
