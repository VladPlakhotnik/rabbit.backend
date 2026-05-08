import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddVipQualifyingVolume1746900000
  implements MigrationInterface
{
  name = 'AddVipQualifyingVolume1746900000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "vip_qualifying_volume" numeric(12,2) NOT NULL DEFAULT 0;
    `)

    await queryRunner.query(`
      UPDATE "users" u
      SET "vip_qualifying_volume" = COALESCE(history.total_cost, 0)
      FROM (
        SELECT
          ch."user_id",
          SUM(
            COALESCE(
              ch."total_cost",
              ch."case_price" * COALESCE(ch."total_drops", 1),
              ch."case_price"
            )
          ) AS total_cost
        FROM "case_history" ch
        INNER JOIN "cases" c
          ON c."id" = ch."case_id"
          AND c."name" = ch."case_name"
        GROUP BY ch."user_id"
      ) history
      WHERE u."id" = history."user_id"
        AND u."vip_qualifying_volume" = 0;
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "vip_qualifying_volume";
    `)
  }
}
