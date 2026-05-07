import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common'
import { ApiBearerAuth } from '@nestjs/swagger'
import { AdminRoles } from './admin-roles.decorator'
import { AdminJwtGuard } from '../guards/admin-jwt.guard'
import { AdminRolesGuard } from '../guards/admin-roles.guard'
import { AdminRole } from '../types/admin-role.enum'

export const ADMIN_MUTATION_AUDIT_META = 'adminMutationAudit'

export interface AdminMutationAuditOptions {
  entity: string
  action: 'create' | 'update' | 'delete'
}

export const AdminMutation = (
  audit: AdminMutationAuditOptions,
  roles: AdminRole[] = [AdminRole.SUPER_ADMIN, AdminRole.ADMIN],
) =>
  applyDecorators(
    ApiBearerAuth(),
    UseGuards(AdminJwtGuard, AdminRolesGuard),
    AdminRoles(...roles),
    SetMetadata(ADMIN_MUTATION_AUDIT_META, audit),
  )
