import { Injectable } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { getJwtAccessSecret } from '../admin.config'
import { Admin } from '../entities/admin.entity'
import { AdminAuthService } from '../services/admin-auth.service'
import { AccessTokenPayload } from '../types/jwt-payload'

// Validates the Bearer access token on every protected admin endpoint.
// Lives under the strategy name 'admin-jwt' to avoid clashing with the
// existing OAuth strategies in modules/auth (game-user side).
@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor(private readonly auth: AdminAuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getJwtAccessSecret(),
    })
  }

  // Passport calls this after signature + expiry pass. Returning
  // throws → 401. Whatever's returned becomes req.user — we attach
  // the live Admin row so downstream guards see role/is_active as of
  // right now (not as of token-issue time).
  async validate(payload: AccessTokenPayload): Promise<Admin> {
    return this.auth.findActiveAdmin(payload)
  }
}
