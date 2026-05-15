import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddUserCountry1748600000 implements MigrationInterface {
  name = 'AddUserCountry1748600000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "country_code" varchar(2),
        ADD COLUMN IF NOT EXISTS "country_source" varchar(32),
        ADD COLUMN IF NOT EXISTS "country_detected_at" timestamptz
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_country_code"
        ON "users" ("country_code")
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_users_country_code"')

    await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN IF EXISTS "country_detected_at",
        DROP COLUMN IF EXISTS "country_source",
        DROP COLUMN IF EXISTS "country_code"
    `)
  }
}

