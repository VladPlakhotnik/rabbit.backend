// Runtime sanity check on the environment. Catches missing/empty config at
// startup instead of failing on the first request that needs it (e.g. a
// 500 from a social or partner flow halfway through because a provider
// key was undefined).
//
// In production: throws on missing REQUIRED vars — better to crash on boot
// than to limp along serving broken endpoints.
// In development: warns only, so a half-configured local setup still starts.

import { Logger } from '@nestjs/common'

// Without these, the app simply cannot do its job correctly. Missing → fail.
// JWT secrets were split into ACCESS + REFRESH (see auth-secrets.ts) to
// stop a leak of one from compromising the other.
const REQUIRED_VARS = [
  'DATABASE_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'ADMIN_JWT_ACCESS_SECRET',
  'ADMIN_JWT_REFRESH_SECRET',
] as const

// App will start without these but key features will silently break.
// Listed for an explicit warning so the dev knows what they're missing.
const RECOMMENDED_VARS = [
  'REDIS_URL',
  'CORS_ORIGINS',
  'STEAM_API_KEY',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHANNEL_CHAT_ID',
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
  'DISCORD_BOT_TOKEN',
  'DISCORD_GUILD_ID',
  'DISCORD_INVITE_URL',
  'PARTNER_ATTRIBUTION_SALT',
] as const

// Catches a copy-paste of `.env.example` where placeholders weren't replaced.
// Better to crash than to run with a `replace_me` JWT secret in prod.
const PLACEHOLDER_PATTERN = /^replace_me/i

const logger = new Logger('EnvValidation')

export function validateEnv(): void {
  const isProd = process.env.NODE_ENV === 'production'

  const missingRequired = REQUIRED_VARS.filter(
    key => !process.env[key]?.trim(),
  )
  const placeholdered = REQUIRED_VARS.filter(key => {
    const v = process.env[key]?.trim()
    return v && PLACEHOLDER_PATTERN.test(v)
  })

  if (missingRequired.length > 0 || placeholdered.length > 0) {
    const msg = [
      missingRequired.length > 0
        ? `missing: ${missingRequired.join(', ')}`
        : null,
      placeholdered.length > 0
        ? `still placeholders: ${placeholdered.join(', ')}`
        : null,
    ]
      .filter(Boolean)
      .join(' | ')

    if (isProd) {
      throw new Error(`Required env vars not set — ${msg}`)
    }
    logger.warn(`⚠️  Required env vars not set (will fail in prod): ${msg}`)
  }

  const missingRecommended = RECOMMENDED_VARS.filter(
    key => !process.env[key]?.trim(),
  )
  if (missingRecommended.length > 0) {
    logger.warn(
      `Missing recommended env vars: ${missingRecommended.join(', ')}`,
    )
  }
}
