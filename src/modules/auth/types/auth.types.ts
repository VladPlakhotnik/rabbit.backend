/**
 * Authentication-related type definitions
 */

export interface SteamAuthResult {
  steam_id: string
  display_name: string
  avatar: string | null
  profile_url: string | null
}

export interface GoogleAuthResult {
  google_id: string
  email: string
  display_name: string
  avatar: string | null
}

export interface TelegramAuthResult {
  telegram_id: number
  display_name: string
  avatar: string | null
}

export interface AuthCallbackUserData {
  steam_id?: string | number | null
  telegram_user_id?: number | null
  google_id?: string | null
  display_name: string
  avatar: string
  profile_url: string
}

export interface TokenResponse {
  accessToken: string
  refreshToken: string
}

// Refresh now rotates BOTH tokens (one-shot consumption of the old
// refresh, fresh pair on success), so the response carries the new
// refreshToken too — clients should overwrite their cookie / storage
// with whatever comes back.
export type RefreshTokenResponse = TokenResponse
