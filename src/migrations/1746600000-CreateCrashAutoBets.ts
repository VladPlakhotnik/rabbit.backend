import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateCrashAutoBets1746600000 implements MigrationInterface {
  name = 'CreateCrashAutoBets1746600000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "crash_auto_bets" (
        "id" serial PRIMARY KEY,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "name" varchar(80) NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "auto_cashout_multiplier" numeric(10,2) NOT NULL,
        "initial_bet" numeric(12,2) NOT NULL,
        "max_bet" numeric(12,2) NOT NULL,
        "on_win_action" varchar(40) NOT NULL DEFAULT 'reset_to_initial',
        "on_loss_action" varchar(40) NOT NULL DEFAULT 'keep_current',
        "on_max_bet_action" varchar(40) NOT NULL DEFAULT 'reset_to_initial',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_crash_auto_bets_name" CHECK (length(trim("name")) > 0),
        CONSTRAINT "CHK_crash_auto_bets_multiplier"
          CHECK ("auto_cashout_multiplier" >= 1.01 AND "auto_cashout_multiplier" <= 10000.00),
        CONSTRAINT "CHK_crash_auto_bets_initial_bet"
          CHECK ("initial_bet" >= 0.50 AND "initial_bet" <= 5000.00),
        CONSTRAINT "CHK_crash_auto_bets_max_bet"
          CHECK ("max_bet" >= 0.50 AND "max_bet" <= 5000.00),
        CONSTRAINT "CHK_crash_auto_bets_stake_range"
          CHECK ("max_bet" >= "initial_bet"),
        CONSTRAINT "CHK_crash_auto_bets_on_win_action"
          CHECK ("on_win_action" IN ('reset_to_initial', 'keep_current', 'increase_50', 'double', 'stop_strategy')),
        CONSTRAINT "CHK_crash_auto_bets_on_loss_action"
          CHECK ("on_loss_action" IN ('reset_to_initial', 'keep_current', 'increase_50', 'double', 'stop_strategy')),
        CONSTRAINT "CHK_crash_auto_bets_on_max_bet_action"
          CHECK ("on_max_bet_action" IN ('reset_to_initial', 'keep_current', 'increase_50', 'double', 'stop_strategy'))
      );
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_crash_auto_bets_user_created_at"
        ON "crash_auto_bets" ("user_id", "created_at" DESC);
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "crash_auto_bets";')
  }
}
