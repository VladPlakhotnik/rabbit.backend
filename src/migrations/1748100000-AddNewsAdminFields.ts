import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddNewsAdminFields1748100000 implements MigrationInterface {
  name = 'AddNewsAdminFields1748100000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "news"
      ADD COLUMN IF NOT EXISTS "preview_image" varchar NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "category" varchar(255) NOT NULL DEFAULT 'General'
    `)
    await queryRunner.query(
      `UPDATE "news" SET "preview_image" = '' WHERE "preview_image" IS NULL`,
    )
    await queryRunner.query(
      `UPDATE "news" SET "category" = 'General' WHERE "category" IS NULL`,
    )
    await queryRunner.query(
      `ALTER TABLE "news" ALTER COLUMN "preview_image" SET NOT NULL`,
    )
    await queryRunner.query(
      `ALTER TABLE "news" ALTER COLUMN "category" SET NOT NULL`,
    )
    await queryRunner.query(
      `ALTER TABLE "news" ALTER COLUMN "preview_image" DROP DEFAULT`,
    )
    await queryRunner.query(
      `ALTER TABLE "news" ALTER COLUMN "category" DROP DEFAULT`,
    )
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "news" DROP COLUMN IF EXISTS "category"`,
    )
    await queryRunner.query(
      `ALTER TABLE "news" DROP COLUMN IF EXISTS "preview_image"`,
    )
  }
}
