import assert from 'node:assert/strict'

import { sanitizeAuditPayload } from './catalog-audit.service'

function masksSensitiveFieldsDeeply() {
  const input = {
    email: 'admin@bunny.com',
    password: 'SuperSecret123!',
    totp_code: '123456',
    nested: {
      access_token: 'access.jwt',
      refreshToken: 'refresh.jwt',
      webhook_secret: 'whsec_123',
      safe: 'kept',
    },
    items: [
      { code: 'VISIBLE', token_hash: 'bcrypt-hash' },
      'plain',
      42,
    ],
  }

  const result = sanitizeAuditPayload(input) as typeof input

  assert.equal(result.email, 'admin@bunny.com')
  assert.equal(result.password, '[redacted]')
  assert.equal(result.totp_code, '[redacted]')
  assert.equal(result.nested.access_token, '[redacted]')
  assert.equal(result.nested.refreshToken, '[redacted]')
  assert.equal(result.nested.webhook_secret, '[redacted]')
  assert.equal(result.nested.safe, 'kept')
  const firstItem = result.items[0] as { code: string; token_hash: string }
  assert.equal(firstItem.code, 'VISIBLE')
  assert.equal(firstItem.token_hash, '[redacted]')
  assert.equal(result.items[1], 'plain')
  assert.equal(result.items[2], 42)
}

function capsLargeStrings() {
  const result = sanitizeAuditPayload({
    description: 'a'.repeat(12_000),
  }) as { description: string }

  assert.equal(result.description.length, 2003)
  assert.ok(result.description.endsWith('...'))
}

function run() {
  masksSensitiveFieldsDeeply()
  capsLargeStrings()
  console.log('catalog-audit.service.spec.ts passed')
}

run()
