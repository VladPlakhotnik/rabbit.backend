import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddDiscordSubscriptionBonus1747300000
  implements MigrationInterface
{
  name = 'AddDiscordSubscriptionBonus1747300000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "discord_user_id" varchar(64) NULL;
    `)

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "discord_username" varchar(100) NULL;
    `)

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "discord_bonus_claimed" boolean NOT NULL DEFAULT false;
    `)

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_discord_user_id"
      ON "users" ("discord_user_id")
      WHERE "discord_user_id" IS NOT NULL;
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_users_discord_user_id";
    `)

    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "discord_bonus_claimed";
    `)

    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "discord_username";
    `)

    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "discord_user_id";
    `)
  }
}
