import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateCrashSessions1746800000 implements MigrationInterface {
  name = 'CreateCrashSessions1746800000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "crash_sessions" (
        "id" serial PRIMARY KEY,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "stake_mode" varchar(16) NOT NULL,
        "slot" integer NOT NULL DEFAULT 1,
        "stake_amount" numeric(12,2) NOT NULL,
        "cashout_multiplier" numeric(12,2),
        "win_amount" numeric(12,2),
        "status" varchar(24) NOT NULL DEFAULT 'active',
        "mfr_algorithm" varchar(32) NOT NULL DEFAULT 'MFR_MATH_RANDOM',
        "mfr_seed_hash" varchar(64) NOT NULL,
        "stake_items" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_crash_sessions_stake_mode"
          CHECK ("stake_mode" IN ('balance', 'inventory')),
        CONSTRAINT "CHK_crash_sessions_status"
          CHECK ("status" IN ('active', 'cashed_out', 'crashed')),
        CONSTRAINT "CHK_crash_sessions_slot"
          CHECK ("slot" IN (1, 2)),
        CONSTRAINT "CHK_crash_sessions_stake_amount"
          CHECK ("stake_amount" >= 0.50 AND "stake_amount" <= 5000.00),
        CONSTRAINT "CHK_crash_sessions_cashout_multiplier"
          CHECK ("cashout_multiplier" IS NULL OR "cashout_multiplier" >= 0),
        CONSTRAINT "CHK_crash_sessions_win_amount"
          CHECK ("win_amount" IS NULL OR "win_amount" >= 0)
      );
    `)

    await queryRunner.query(`
      CREATE INDEX "IDX_crash_sessions_user_status"
        ON "crash_sessions" ("user_id", "status");
    `)

    await queryRunner.query(`
      CREATE INDEX "IDX_crash_sessions_created_at"
        ON "crash_sessions" ("created_at");
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "crash_sessions";')
  }
}
