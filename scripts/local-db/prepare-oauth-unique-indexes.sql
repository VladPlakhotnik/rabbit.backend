-- The 2026-04-30 snapshot predates the OAuth uniqueness constraints and
-- contains a duplicated Telegram link. Keep the oldest local link and clear
-- only later duplicates so the production migration can create its indexes.
-- This runs against the disposable local copy, never against Neon.

WITH ranked_telegram_links AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY telegram_user_id ORDER BY id) AS link_rank
  FROM users
  WHERE telegram_user_id IS NOT NULL
)
UPDATE users
SET telegram_user_id = NULL
FROM ranked_telegram_links
WHERE users.id = ranked_telegram_links.id
  AND ranked_telegram_links.link_rank > 1;

WITH ranked_google_links AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY google_id ORDER BY id) AS link_rank
  FROM users
  WHERE google_id IS NOT NULL
)
UPDATE users
SET google_id = NULL
FROM ranked_google_links
WHERE users.id = ranked_google_links.id
  AND ranked_google_links.link_rank > 1;

WITH ranked_steam_links AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY steam_id ORDER BY id) AS link_rank
  FROM users
  WHERE steam_id IS NOT NULL
)
UPDATE users
SET steam_id = NULL
FROM ranked_steam_links
WHERE users.id = ranked_steam_links.id
  AND ranked_steam_links.link_rank > 1;
