import { AdminRole } from './admin-role.enum'

export const ADMIN_ALL_ROLES: readonly AdminRole[] = [
  AdminRole.SUPER_ADMIN,
  AdminRole.ADMIN,
  AdminRole.MANAGER,
  AdminRole.VIEWER,
  AdminRole.INVESTOR,
] as const

export const ADMIN_READ_ROLES: readonly AdminRole[] = [
  AdminRole.SUPER_ADMIN,
  AdminRole.ADMIN,
  AdminRole.MANAGER,
  AdminRole.VIEWER,
] as const

export const ADMIN_STAFF_MANAGEMENT_ROLES: readonly AdminRole[] = [
  AdminRole.SUPER_ADMIN,
] as const

export const ADMIN_OPERATIONAL_ROLES: readonly AdminRole[] = [
  AdminRole.SUPER_ADMIN,
  AdminRole.ADMIN,
  AdminRole.MANAGER,
] as const

export const ADMIN_SENSITIVE_ROLES: readonly AdminRole[] = [
  AdminRole.SUPER_ADMIN,
  AdminRole.ADMIN,
] as const

export const ADMIN_WRITE_ROLES: readonly AdminRole[] = ADMIN_SENSITIVE_ROLES

export const ADMIN_CASE_READ_ROLES: readonly AdminRole[] = [
  AdminRole.SUPER_ADMIN,
  AdminRole.ADMIN,
  AdminRole.MANAGER,
] as const

export const ADMIN_CASE_WRITE_ROLES: readonly AdminRole[] = [
  AdminRole.SUPER_ADMIN,
  AdminRole.ADMIN,
] as const

export const ADMIN_2FA_REQUIRED_ROLES: readonly AdminRole[] = [
  AdminRole.SUPER_ADMIN,
  AdminRole.ADMIN,
  AdminRole.MANAGER,
] as const

export type AdminRouteAccessKey =
  | 'adminProfile'
  | 'analytics'
  | 'bonuses'
  | 'cases'
  | 'clicker'
  | 'crash'
  | 'dashboard'
  | 'deposits'
  | 'logs'
  | 'mines'
  | 'news'
  | 'notifications'
  | 'partnership'
  | 'players'
  | 'settings'
  | 'skins'
  | 'upgrades'
  | 'users'
  | 'vip'
  | 'withdrawals'

export const ADMIN_ROUTE_ACCESS: Record<
  AdminRouteAccessKey,
  readonly AdminRole[]
> = {
  adminProfile: ADMIN_ALL_ROLES,
  analytics: ADMIN_ALL_ROLES,
  dashboard: ADMIN_ALL_ROLES,
  settings: ADMIN_ALL_ROLES,
  users: ADMIN_STAFF_MANAGEMENT_ROLES,
  players: ADMIN_READ_ROLES,
  cases: ADMIN_CASE_READ_ROLES,
  skins: ADMIN_OPERATIONAL_ROLES,
  clicker: ADMIN_READ_ROLES,
  mines: ADMIN_READ_ROLES,
  crash: ADMIN_READ_ROLES,
  upgrades: ADMIN_READ_ROLES,
  news: ADMIN_READ_ROLES,
  bonuses: ADMIN_READ_ROLES,
  vip: ADMIN_READ_ROLES,
  partnership: ADMIN_READ_ROLES,
  deposits: ADMIN_READ_ROLES,
  withdrawals: ADMIN_READ_ROLES,
  notifications: ADMIN_READ_ROLES,
  logs: ADMIN_READ_ROLES,
}

export const isAdmin2faRequiredRole = (role: AdminRole): boolean =>
  ADMIN_2FA_REQUIRED_ROLES.includes(role)

export const isAdminRouteAllowed = (
  role: AdminRole,
  route: AdminRouteAccessKey,
): boolean => ADMIN_ROUTE_ACCESS[route].includes(role)
