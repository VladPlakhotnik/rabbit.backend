import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddSteamProfileBonusState1747800000 implements MigrationInterface {
  name = 'AddSteamProfileBonusState1747800000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "steam_avatar_bonus_claimed_at" timestamp NULL,
      ADD COLUMN IF NOT EXISTS "steam_avatar_bonus_last_verified_at" timestamp NULL,
      ADD COLUMN IF NOT EXISTS "steam_avatar_bonus_active" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "steam_nickname_bonus_claimed_at" timestamp NULL,
      ADD COLUMN IF NOT EXISTS "steam_nickname_bonus_last_verified_at" timestamp NULL,
      ADD COLUMN IF NOT EXISTS "steam_nickname_bonus_active" boolean NOT NULL DEFAULT false
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "steam_nickname_bonus_active",
      DROP COLUMN IF EXISTS "steam_nickname_bonus_last_verified_at",
      DROP COLUMN IF EXISTS "steam_nickname_bonus_claimed_at",
      DROP COLUMN IF EXISTS "steam_avatar_bonus_active",
      DROP COLUMN IF EXISTS "steam_avatar_bonus_last_verified_at",
      DROP COLUMN IF EXISTS "steam_avatar_bonus_claimed_at"
    `)
  }
}
