import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import { CatalogAuditService } from '../../../core/audit/catalog-audit.service'
import { CurrentAdmin } from '../decorators/current-admin.decorator'
import { AdminRoles } from '../decorators/admin-roles.decorator'
import {
  AdminAuditLogQueryDto,
  AdminSecurityEventsQueryDto,
} from '../dto/admin-security-query.dto'
import { Admin } from '../entities/admin.entity'
import { AdminJwtGuard } from '../guards/admin-jwt.guard'
import { AdminRolesGuard } from '../guards/admin-roles.guard'
import { AdminSecurityEventService } from '../services/admin-security-event.service'
import {
  ADMIN_2FA_REQUIRED_ROLES,
  ADMIN_READ_ROLES,
} from '../types/admin-role-policy'

@Controller('admin/security')
@UseGuards(ThrottlerGuard, AdminJwtGuard)
export class AdminSecurityController {
  constructor(
    private readonly securityEvents: AdminSecurityEventService,
    private readonly audit: CatalogAuditService,
  ) {}

  @Get('policy')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  getPolicy() {
    return {
      access_token_ttl_seconds: Number(
        process.env.ADMIN_ACCESS_TOKEN_TTL_SECONDS ?? 15 * 60,
      ),
      refresh_token_ttl_seconds: Number(
        process.env.ADMIN_REFRESH_TOKEN_TTL_SECONDS ?? 7 * 24 * 60 * 60,
      ),
      two_factor_required_roles: ADMIN_2FA_REQUIRED_ROLES,
      step_up_required: false,
    }
  }

  @Get('events/me')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  myEvents(@CurrentAdmin() admin: Admin) {
    return this.securityEvents.listForAdmin(admin.id, 25)
  }

  @Get('events')
  @UseGuards(AdminRolesGuard)
  @AdminRoles(...ADMIN_READ_ROLES)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  events(@Query() query: AdminSecurityEventsQueryDto) {
    return this.securityEvents.list(query)
  }

  @Get('audit')
  @UseGuards(AdminRolesGuard)
  @AdminRoles(...ADMIN_READ_ROLES)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  auditLog(@Query() query: AdminAuditLogQueryDto) {
    return this.audit.list(query.limit)
  }
}

