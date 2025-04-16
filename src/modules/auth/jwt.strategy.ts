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
    const user = await this.userService.findBySteamId(payload.steam_id)
    if (!user) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.NOT_AUTHENTICATED)
    }
    return user
  }
}
