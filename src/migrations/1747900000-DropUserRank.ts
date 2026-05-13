import { MigrationInterface, QueryRunner } from 'typeorm'

export class DropUserRank1747900000 implements MigrationInterface {
  name = 'DropUserRank1747900000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "rank"`)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "rank" varchar(50) NOT NULL DEFAULT 'initiate_1'`,
    )
  }
}
