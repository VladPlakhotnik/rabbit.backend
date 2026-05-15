import assert from 'node:assert/strict'

import { validateEnv } from './validate-env'

const ORIGINAL_ENV = { ...process.env }

function resetEnv() {
  process.env = { ...ORIGINAL_ENV }
}

function withBaseProdEnv() {
  process.env = {
    ...ORIGINAL_ENV,
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://user:password@localhost:5432/bunny',
    JWT_ACCESS_SECRET: 'user-access-secret',
    JWT_REFRESH_SECRET: 'user-refresh-secret',
    ADMIN_JWT_ACCESS_SECRET: '',
    ADMIN_JWT_REFRESH_SECRET: '',
  }
}

function requiresAdminJwtSecretsInProduction() {
  withBaseProdEnv()

  assert.throws(
    () => validateEnv(),
    /ADMIN_JWT_ACCESS_SECRET.*ADMIN_JWT_REFRESH_SECRET/,
  )
}

function rejectsAdminPlaceholderSecretsInProduction() {
  withBaseProdEnv()
  process.env.ADMIN_JWT_ACCESS_SECRET = 'replace_me_admin_access_secret'
  process.env.ADMIN_JWT_REFRESH_SECRET = 'replace_me_admin_refresh_secret'

  assert.throws(() => validateEnv(), /still placeholders/)
}

function acceptsRealAdminSecretsInProduction() {
  withBaseProdEnv()
  process.env.ADMIN_JWT_ACCESS_SECRET = 'admin-access-secret'
  process.env.ADMIN_JWT_REFRESH_SECRET = 'admin-refresh-secret'

  assert.doesNotThrow(() => validateEnv())
}

function run() {
  try {
    requiresAdminJwtSecretsInProduction()
    rejectsAdminPlaceholderSecretsInProduction()
    acceptsRealAdminSecretsInProduction()
    console.log('validate-env-admin.spec.ts passed')
  } finally {
    resetEnv()
  }
}

run()
