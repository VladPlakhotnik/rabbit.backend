import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { Strategy, ExtractJwt } from 'passport-jwt'
import { UserService } from '../users/users.service'
import type { JwtPayload } from './auth.service'
import { ERROR_MESSAGES } from '../../constants/errorMessages'

/**
 * JWT authentication strategy
 * @class JwtStrategy
 * @extends {PassportStrategy}
 */

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly userService: UserService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    })
  }

  async validate(payload: JwtPayload) {
    // Convert steam_id to number since it's stored as string in JWT but as number in database
    const steamId =
      typeof payload.steam_id === 'string'
        ? parseInt(payload.steam_id, 10)
        : payload.steam_id

    // Check if steam_id is valid (not NaN)
    if (isNaN(steamId)) {
      throw new UnauthorizedException(
        'Invalid token: steam_id is not a valid number',
      )
    }

    const user = await this.userService.findBySteamId(steamId)

    if (!user) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.NOT_AUTHENTICATED)
    }

    return user
  }
}
