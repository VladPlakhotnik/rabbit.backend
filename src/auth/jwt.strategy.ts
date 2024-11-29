import { Injectable } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { Strategy, ExtractJwt } from 'passport-jwt'
import { ConfigService } from '@nestjs/config'
import { UserService } from '../users/users.service'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly userService: UserService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    })
  }

  async validate(payload: any) {
    const user = await this.userService.findBySteamId(payload.steamid)
    if (!user) {
      throw new Error('Unauthorized')
    }
    return user // Добавляет пользователя в `req.user`
  }
}
