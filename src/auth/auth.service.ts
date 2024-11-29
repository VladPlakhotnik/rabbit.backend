import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { User } from '../users/users.entity'

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  async login(user: User) {
    const payload = { steamid: user.steamid, sub: user.id } // sub — стандартное поле для идентификатора пользователя
    return this.jwtService.sign(payload)
  }
}
