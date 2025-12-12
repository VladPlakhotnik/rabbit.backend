import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { Strategy, ExtractJwt } from 'passport-jwt'
import { ConfigService } from '@nestjs/config'
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
  constructor(
    private readonly userService: UserService,
    private readonly configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    })
  }

  async validate(payload: JwtPayload) {
    // Convert sub (user ID) to number since JWT may store it as string
    const userId =
      typeof payload.sub === 'string' ? parseInt(payload.sub, 10) : payload.sub

    // Check if user ID is valid
    if (isNaN(userId) || userId <= 0) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.INVALID_TOKEN)
    }

    // At least one auth method should be present
    if (!payload.steam_id && !payload.telegram_id && !payload.google_id) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.INVALID_TOKEN)
    }

    const user = await this.userService.findById(userId)

    if (!user) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.NOT_AUTHENTICATED)
    }

    return user
  }
}
