import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateMinesSessions1746500000 implements MigrationInterface {
  name = 'CreateMinesSessions1746500000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "mines_sessions" (
        "id" serial PRIMARY KEY,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "stake_mode" varchar(16) NOT NULL,
        "bet_amount" numeric(12,2) NOT NULL,
        "mines_count" integer NOT NULL,
        "board_size" integer NOT NULL DEFAULT 25,
        "mine_positions" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "revealed_cells" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "current_multiplier" numeric(12,2) NOT NULL DEFAULT 1,
        "win_amount" numeric(12,2),
        "status" varchar(24) NOT NULL DEFAULT 'active',
        "mfr_algorithm" varchar(32) NOT NULL DEFAULT 'MFR_CRYPTO_RANDOM_INT',
        "mfr_seed_hash" varchar(64) NOT NULL,
        "stake_items" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_mines_sessions_stake_mode"
          CHECK ("stake_mode" IN ('balance', 'inventory')),
        CONSTRAINT "CHK_mines_sessions_status"
          CHECK ("status" IN ('active', 'cashed_out', 'lost')),
        CONSTRAINT "CHK_mines_sessions_mines_count"
          CHECK ("mines_count" BETWEEN 2 AND 20),
        CONSTRAINT "CHK_mines_sessions_board_size"
          CHECK ("board_size" = 25),
        CONSTRAINT "CHK_mines_sessions_bet_amount"
          CHECK ("bet_amount" >= 0.50 AND "bet_amount" <= 5000.00)
      );
    `)

    await queryRunner.query(`
      CREATE INDEX "IDX_mines_sessions_user_status"
        ON "mines_sessions" ("user_id", "status");
    `)

    await queryRunner.query(`
      CREATE INDEX "IDX_mines_sessions_created_at"
        ON "mines_sessions" ("created_at");
    `)

    await queryRunner.query(`
      CREATE INDEX "IDX_mines_sessions_top_winners"
        ON "mines_sessions" ("win_amount" DESC, "created_at" DESC)
        WHERE "status" = 'cashed_out';
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "mines_sessions";')
  }
}
