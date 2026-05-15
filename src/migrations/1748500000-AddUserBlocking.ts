import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddUserBlocking1748500000 implements MigrationInterface {
  name = 'AddUserBlocking1748500000'

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('users')
    if (!table?.findColumnByName('is_blocked')) {
      await queryRunner.query(`
        ALTER TABLE "users"
          ADD COLUMN "is_blocked" boolean NOT NULL DEFAULT false,
          ADD COLUMN "blocked_reason" text,
          ADD COLUMN "blocked_reason_template" varchar(64),
          ADD COLUMN "blocked_at" timestamptz,
          ADD COLUMN "blocked_by_admin_id" uuid,
          ADD COLUMN "unblocked_at" timestamptz,
          ADD COLUMN "unblocked_by_admin_id" uuid
      `)
    }

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_is_blocked"
        ON "users" ("is_blocked")
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_users_is_blocked"')

    const table = await queryRunner.getTable('users')
    if (table?.findColumnByName('is_blocked')) {
      await queryRunner.query(`
        ALTER TABLE "users"
          DROP COLUMN "unblocked_by_admin_id",
          DROP COLUMN "unblocked_at",
          DROP COLUMN "blocked_by_admin_id",
          DROP COLUMN "blocked_at",
          DROP COLUMN "blocked_reason_template",
          DROP COLUMN "blocked_reason",
          DROP COLUMN "is_blocked"
      `)
    }
  }
}
