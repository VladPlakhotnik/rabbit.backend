ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "steam_avatar_bonus_claimed_at" timestamp NULL,
ADD COLUMN IF NOT EXISTS "steam_avatar_bonus_last_verified_at" timestamp NULL,
ADD COLUMN IF NOT EXISTS "steam_avatar_bonus_active" boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "steam_nickname_bonus_claimed_at" timestamp NULL,
ADD COLUMN IF NOT EXISTS "steam_nickname_bonus_last_verified_at" timestamp NULL,
ADD COLUMN IF NOT EXISTS "steam_nickname_bonus_active" boolean NOT NULL DEFAULT false;
