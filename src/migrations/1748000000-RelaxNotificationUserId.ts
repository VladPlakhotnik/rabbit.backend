import { MigrationInterface, QueryRunner } from 'typeorm'

export class RelaxNotificationUserId1748000000 implements MigrationInterface {
  name = 'RelaxNotificationUserId1748000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notifications" ALTER COLUMN "user_id" DROP NOT NULL`,
    )
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notifications" ALTER COLUMN "user_id" SET NOT NULL`,
    )
  }
}
