import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import { ApiBearerAuth } from '@nestjs/swagger'
import { AdminRoles } from './admin-roles.decorator'
import { AdminJwtGuard } from '../guards/admin-jwt.guard'
import { AdminRolesGuard } from '../guards/admin-roles.guard'
import { AdminRole } from '../types/admin-role.enum'
import { ADMIN_WRITE_ROLES } from '../types/admin-role-policy'

export const ADMIN_MUTATION_AUDIT_META = 'adminMutationAudit'

export interface AdminMutationAuditOptions {
  entity: string
  action: 'create' | 'update' | 'delete'
}

export const AdminMutation = (
  audit: AdminMutationAuditOptions,
  roles: readonly AdminRole[] = ADMIN_WRITE_ROLES,
) =>
  applyDecorators(
    ApiBearerAuth(),
    UseGuards(ThrottlerGuard, AdminJwtGuard, AdminRolesGuard),
    Throttle({ default: { limit: 30, ttl: 60_000 } }),
    AdminRoles(...roles),
    SetMetadata(ADMIN_MUTATION_AUDIT_META, audit),
  )
