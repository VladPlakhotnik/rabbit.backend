import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { User } from '../users/user.entity'

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  login(user: User) {
    const payload = { steam_id: user.steam_id, sub: user.id } // sub — стандартное поле для идентификатора пользователя
    return this.jwtService.sign(payload)
  }
}
