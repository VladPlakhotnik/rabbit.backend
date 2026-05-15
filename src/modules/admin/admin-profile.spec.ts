import { strict as assert } from 'node:assert'
import {
  ADMIN_AVATAR_BASE64_MAX_LENGTH,
  ADMIN_PROFILE_JSON_BODY_LIMIT_BYTES,
  normalizeAdminProfileUpdate,
  validateAdminAvatarUrl,
} from './utils/admin-profile'

function trimsNamesAndKeepsValidAvatar() {
  const avatar =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'
  const result = normalizeAdminProfileUpdate({
    first_name: '  Ada  ',
    last_name: '  Lovelace  ',
    avatar_url: avatar,
  })

  assert.equal(result.first_name, 'Ada')
  assert.equal(result.last_name, 'Lovelace')
  assert.equal(result.avatar_url, avatar)
}

function acceptsAvatarRemoval() {
  const result = normalizeAdminProfileUpdate({ avatar_url: null })

  assert.equal(result.avatar_url, null)
}

function rejectsExternalAndSvgAvatars() {
  assert.equal(validateAdminAvatarUrl('https://example.com/avatar.png'), false)
  assert.equal(
    validateAdminAvatarUrl('data:image/svg+xml;base64,PHN2Zy8+'),
    false,
  )
}

function rejectsOversizedAvatar() {
  const oversized = `data:image/png;base64,${'a'.repeat(700_001)}`

  assert.equal(validateAdminAvatarUrl(oversized), false)
}

function jsonBodyLimitFitsMaxAvatar() {
  assert.ok(
    ADMIN_PROFILE_JSON_BODY_LIMIT_BYTES > ADMIN_AVATAR_BASE64_MAX_LENGTH + 4096,
  )
}

trimsNamesAndKeepsValidAvatar()
acceptsAvatarRemoval()
rejectsExternalAndSvgAvatars()
rejectsOversizedAvatar()
jsonBodyLimitFitsMaxAvatar()

console.log('admin-profile.spec.ts passed')
