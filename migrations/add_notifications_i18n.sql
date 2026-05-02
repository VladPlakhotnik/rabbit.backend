-- Add i18n payload to notifications so the frontend can localize the
-- text at render time instead of receiving a single hardcoded string.
--
-- Two paths share the table:
--
--   1. Typed event (preferred for code-driven triggers):
--        i18n_key   = 'withdraw.completed'
--        i18n_params = { "price": 12.34 }
--      Frontend resolves `t('notifications.events.withdraw.completed.title', params)`
--      and `t('notifications.events.withdraw.completed.message', params)`.
--      Locale follows the user's current UI language at view time.
--
--   2. Free-form admin broadcast (one-off news that doesn't fit a
--      template):
--        title   = 'Запланированные работы'
--        message = '23.05 в 04:00 …'
--      Stored as-is in the language the admin wrote them. Used by the
--      admin POST /notifications endpoint when no i18n_key is given.
--
-- Both paths can coexist on a single row only if needed (i18n_key + a
-- fallback title/message), but typically each notification uses one or
-- the other. The CHECK below enforces that at least one path is filled.

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS i18n_key   VARCHAR(120),
  ADD COLUMN IF NOT EXISTS i18n_params JSONB;

-- title/message become optional — typed events don't fill them.
ALTER TABLE notifications ALTER COLUMN title   DROP NOT NULL;
ALTER TABLE notifications ALTER COLUMN message DROP NOT NULL;

-- Guard: a row must carry either a key or a complete free-form pair.
-- Without this, a buggy caller could insert `{}` and the UI would show
-- a blank notification.
ALTER TABLE notifications
  ADD CONSTRAINT notifications_payload_not_empty CHECK (
    i18n_key IS NOT NULL
    OR (title IS NOT NULL AND message IS NOT NULL)
  );

-- Partial index — only on rows that have a key. Used for analytics
-- ("how many withdraw_failed last week") and for admin-side filters.
-- Skipping NULL rows keeps it small (admin broadcasts have no key).
CREATE INDEX IF NOT EXISTS idx_notifications_i18n_key
  ON notifications (i18n_key)
  WHERE i18n_key IS NOT NULL;
