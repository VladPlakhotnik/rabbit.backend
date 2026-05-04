import { Controller, Get, UseGuards } from '@nestjs/common'
import { CurrentAdmin } from '../decorators/current-admin.decorator'
import { Admin } from '../entities/admin.entity'
import { AdminJwtGuard } from '../guards/admin-jwt.guard'

// Bare /me endpoint, deliberately not /admin/me — keeps the URL short
// and consistent with other "current user" patterns. Returns the live
// admin row (not the JWT payload), so role / is_active changes show
// up here as soon as the next request lands.
@Controller('me')
@UseGuards(AdminJwtGuard)
export class MeController {
  @Get()
  me(@CurrentAdmin() admin: Admin) {
    return admin.toSafeJson()
  }
}
