import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { User } from '../users/user.entity'
import {
  ACCESS_TOKEN_EXPIRES,
  REFRESH_TOKEN_EXPIRES,
} from '../../constants/common'

export interface JwtPayload {
  steam_id: number
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
  constructor(private readonly jwtService: JwtService) {}

  async login(user: User) {
    const payload: JwtPayload = {
      steam_id: user.steam_id,
      sub: user.id,
    }

    // Generate access token (short-lived) and refresh token (long-lived)
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.sign(payload, { expiresIn: ACCESS_TOKEN_EXPIRES }),
      this.jwtService.sign(payload, { expiresIn: REFRESH_TOKEN_EXPIRES }),
    ])

    return { accessToken, refreshToken }
  }

  async refreshToken(refreshToken: string) {
    try {
      // Check if the refresh token is valid
      const payload = this.jwtService.verify(refreshToken)

      // Generate new access token
      const newAccessToken = this.jwtService.sign(
        {
          steam_id: payload.steam_id,
          sub: payload.sub,
        },
        { expiresIn: ACCESS_TOKEN_EXPIRES },
      )

      return { accessToken: newAccessToken }
    } catch (error) {
      throw new Error('Invalid refresh token')
    }
  }
}
