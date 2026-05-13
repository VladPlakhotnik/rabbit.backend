import { SetMetadata } from '@nestjs/common'
import { AdminRole } from '../types/admin-role.enum'

export const ADMIN_ROLES_KEY = 'admin_roles'

// Mark an endpoint as accessible only to the listed roles.
//   @AdminRoles(AdminRole.SUPER_ADMIN)
//   @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
//
// Pair with AdminRolesGuard. AdminJwtGuard must run first (decoded
// admin must be on req.user before role check makes sense).
export const AdminRoles = (...roles: AdminRole[]) =>
  SetMetadata(ADMIN_ROLES_KEY, roles)
