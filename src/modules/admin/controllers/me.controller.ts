import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common'
import { CurrentAdmin } from '../decorators/current-admin.decorator'
import { UpdateOwnAdminProfileDto } from '../dto/update-own-profile.dto'
import { Admin } from '../entities/admin.entity'
import { AdminJwtGuard } from '../guards/admin-jwt.guard'
import { AdminService } from '../services/admin.service'

// Bare /me endpoint, deliberately not /admin/me — keeps the URL short
// and consistent with other "current user" patterns. Returns the live
// admin row (not the JWT payload), so role / is_active changes show
// up here as soon as the next request lands.
@Controller('me')
@UseGuards(AdminJwtGuard)
export class MeController {
  constructor(private readonly admins: AdminService) {}

  @Get()
  me(@CurrentAdmin() admin: Admin) {
    return admin.toSafeJson()
  }

  @Patch()
  updateMe(
    @CurrentAdmin() admin: Admin,
    @Body() dto: UpdateOwnAdminProfileDto,
  ) {
    return this.admins.updateOwnProfile(admin, dto)
  }
}
