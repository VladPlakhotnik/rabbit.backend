import { MigrationInterface, QueryRunner } from 'typeorm'

// Replaces the legacy game-user roles ('user' / 'admin' / 'moderator')
// with the new PlayerRole vocabulary. Admin-panel staff now live in
// the separate `admins` table — every game-user that previously held
// `admin` or `moderator` is downgraded to `player` (they need a real
// admin account if they're staff).
//
// Idempotent — safe to re-run; rows already in the new vocabulary
// won't match the WHERE clauses.
export class RenameUserRoles1746200000 implements MigrationInterface {
  name = 'RenameUserRoles1746200000'

  async up(queryRunner: QueryRunner): Promise<void> {
    // Plain-string column today (varchar(50)) — direct UPDATE is enough.
    await queryRunner.query(
      `UPDATE "users" SET "role" = 'player' WHERE "role" IN ('user', 'admin', 'moderator')`,
    )
    await queryRunner.query(
      `UPDATE "users" SET "role" = 'player' WHERE "role" IS NULL OR "role" = ''`,
    )
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Best-effort revert. Can't recover the original admin/moderator
    // assignments — they were dropped intentionally as part of the
    // admin-panel split.
    await queryRunner.query(`UPDATE "users" SET "role" = 'user' WHERE "role" = 'player'`)
  }
}
