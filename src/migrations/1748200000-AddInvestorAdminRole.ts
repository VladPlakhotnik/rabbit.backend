import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddInvestorAdminRole1748200000 implements MigrationInterface {
  name = 'AddInvestorAdminRole1748200000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "admin_role"
      ADD VALUE IF NOT EXISTS 'investor'
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "admins" ALTER COLUMN "role" DROP DEFAULT`,
    )
    await queryRunner.query(
      `ALTER TABLE "admins" ALTER COLUMN "role" TYPE text USING "role"::text`,
    )
    await queryRunner.query(
      `UPDATE "admins" SET "role" = 'viewer' WHERE "role" = 'investor'`,
    )
    await queryRunner.query(`DROP TYPE IF EXISTS "admin_role"`)
    await queryRunner.query(
      `CREATE TYPE "admin_role" AS ENUM ('super_admin', 'admin', 'manager', 'viewer')`,
    )
    await queryRunner.query(`
      ALTER TABLE "admins"
      ALTER COLUMN "role" TYPE "admin_role" USING "role"::"admin_role"
    `)
    await queryRunner.query(
      `ALTER TABLE "admins" ALTER COLUMN "role" SET DEFAULT 'manager'`,
    )
  }
}
