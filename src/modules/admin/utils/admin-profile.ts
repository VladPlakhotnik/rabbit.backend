export const ADMIN_AVATAR_BASE64_MAX_LENGTH = 700_000
export const ADMIN_PROFILE_JSON_BODY_LIMIT_BYTES = 1024 * 1024
export const ADMIN_PROFILE_JSON_BODY_LIMIT = '1mb'

const ADMIN_AVATAR_PATTERN =
  /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/

export interface AdminProfileUpdateInput {
  avatar_url?: string | null
  first_name?: string
  last_name?: string
}

export interface NormalizedAdminProfileUpdate {
  avatar_url?: string | null
  first_name?: string
  last_name?: string
}

export const validateAdminAvatarUrl = (value: string): boolean => {
  if (value.length > ADMIN_AVATAR_BASE64_MAX_LENGTH) return false
  return ADMIN_AVATAR_PATTERN.test(value)
}

export const normalizeAdminProfileUpdate = (
  input: AdminProfileUpdateInput,
): NormalizedAdminProfileUpdate => {
  const result: NormalizedAdminProfileUpdate = {}

  if (input.first_name !== undefined) {
    result.first_name = input.first_name.trim()
  }

  if (input.last_name !== undefined) {
    result.last_name = input.last_name.trim()
  }

  if (input.avatar_url !== undefined) {
    result.avatar_url =
      input.avatar_url === null ? null : input.avatar_url.trim()
  }

  return result
}
