// Roles a staff member of the admin panel can hold. Listed from most
// privileged to least so callers can do `role >= MANAGER` style checks
// — but DON'T rely on enum order, always use explicit checks via the
// @AdminRoles() decorator and AdminRolesGuard. Order here is just for
// readability when adding new roles.
export enum AdminRole {
  SUPER_ADMIN = 'super_admin', // full control + can manage other admins
  ADMIN = 'admin', // standard admin
  MANAGER = 'manager', // limited admin — content / users
  VIEWER = 'viewer', // read-only
}
