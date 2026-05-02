-- Enforce uniqueness of every OAuth-style identifier in `users` at the DB
-- level — last line of defence against silent re-link account-takeover
-- attacks. Each id can belong to exactly one user.
--
-- TypeORM @Column({unique: true}) on the entity emits a UNIQUE index when
-- `synchronize: true`, but production runs with synchronize:false, so a
-- live DB may be missing them. This migration adds the missing ones; it
-- skips silently if they're already in place.
--
-- Postgres treats NULL as "distinct" for UNIQUE indexes by default
-- (NULLS DISTINCT), so multiple users with NULL telegram_user_id /
-- google_id / steam_id keep working without conflict.
--
-- Idempotent — safe to re-run.

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_telegram_user_id
  ON users (telegram_user_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_google_id
  ON users (google_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_steam_id
  ON users (steam_id);
