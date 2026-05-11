import { MigrationInterface, QueryRunner } from 'typeorm'

export class RemoveBonusWheelCashbackRewards1747700000
  implements MigrationInterface
{
  name = 'RemoveBonusWheelCashbackRewards1747700000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "user_bonuses"
      WHERE "reward_id" IN (
        SELECT "id" FROM "rewards" WHERE "type" = 'CASHBACK'
      )
    `)

    await queryRunner.query(`
      DELETE FROM "rewards"
      WHERE "type" = 'CASHBACK'
    `)
  }

  public async down(): Promise<void> {
    // Removed legacy Bonus Wheel cashback rows cannot be reconstructed safely.
  }
}
