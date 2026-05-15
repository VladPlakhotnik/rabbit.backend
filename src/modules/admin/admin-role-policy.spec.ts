import assert from 'node:assert/strict'

import {
  ADMIN_ALL_ROLES,
  ADMIN_CASE_READ_ROLES,
  ADMIN_CASE_WRITE_ROLES,
  ADMIN_OPERATIONAL_ROLES,
  ADMIN_READ_ROLES,
  ADMIN_SENSITIVE_ROLES,
  ADMIN_STAFF_MANAGEMENT_ROLES,
  isAdminRouteAllowed,
} from './types/admin-role-policy'
import { AdminRole } from './types/admin-role.enum'

function investorCanOnlyReadAnalyticsByDefault() {
  assert.ok(ADMIN_READ_ROLES.includes(AdminRole.VIEWER))
  assert.ok(!ADMIN_READ_ROLES.includes(AdminRole.INVESTOR))
  assert.ok(!ADMIN_OPERATIONAL_ROLES.includes(AdminRole.INVESTOR))
  assert.ok(!ADMIN_SENSITIVE_ROLES.includes(AdminRole.INVESTOR))
}

function pageAccessPolicyKeepsInvestorReadOnly() {
  assert.ok(isAdminRouteAllowed(AdminRole.INVESTOR, 'dashboard'))
  assert.ok(isAdminRouteAllowed(AdminRole.INVESTOR, 'analytics'))
  assert.ok(isAdminRouteAllowed(AdminRole.INVESTOR, 'settings'))
  assert.ok(!isAdminRouteAllowed(AdminRole.INVESTOR, 'cases'))
  assert.ok(!isAdminRouteAllowed(AdminRole.INVESTOR, 'vip'))
  assert.ok(!isAdminRouteAllowed(AdminRole.INVESTOR, 'logs'))
  assert.ok(!isAdminRouteAllowed(AdminRole.INVESTOR, 'users'))
}

function caseMutationPolicyIsStricterThanCaseReadPolicy() {
  assert.ok(ADMIN_CASE_READ_ROLES.includes(AdminRole.MANAGER))
  assert.ok(!ADMIN_CASE_READ_ROLES.includes(AdminRole.VIEWER))
  assert.ok(ADMIN_CASE_WRITE_ROLES.includes(AdminRole.ADMIN))
  assert.ok(!ADMIN_CASE_WRITE_ROLES.includes(AdminRole.MANAGER))
  assert.ok(!ADMIN_CASE_WRITE_ROLES.includes(AdminRole.INVESTOR))
}

function staffManagementPolicyIsSuperAdminOnly() {
  assert.deepEqual(ADMIN_STAFF_MANAGEMENT_ROLES, [AdminRole.SUPER_ADMIN])
}

function allRolesIncludesInvestorForCommonPages() {
  assert.ok(ADMIN_ALL_ROLES.includes(AdminRole.INVESTOR))
}

function sensitiveRolesAreStrict() {
  assert.deepEqual(ADMIN_SENSITIVE_ROLES, [
    AdminRole.SUPER_ADMIN,
    AdminRole.ADMIN,
  ])
}

function run() {
  investorCanOnlyReadAnalyticsByDefault()
  pageAccessPolicyKeepsInvestorReadOnly()
  caseMutationPolicyIsStricterThanCaseReadPolicy()
  staffManagementPolicyIsSuperAdminOnly()
  allRolesIncludesInvestorForCommonPages()
  sensitiveRolesAreStrict()
  console.log('admin-role-policy.spec.ts passed')
}

run()
