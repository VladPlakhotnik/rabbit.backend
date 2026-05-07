CREATE TABLE IF NOT EXISTS public.clicker_challenge_conditions (
  id serial PRIMARY KEY,
  type varchar(80) NOT NULL,
  target integer NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clicker_challenge_conditions
  ADD COLUMN IF NOT EXISTS params jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.clicker_challenges (
  id serial PRIMARY KEY,
  key varchar(80),
  name varchar(160) NOT NULL,
  description text NOT NULL,
  points_reward integer NOT NULL,
  action_url varchar(255),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  condition_id integer REFERENCES public.clicker_challenge_conditions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clicker_challenges
  ADD COLUMN IF NOT EXISTS key varchar(80),
  ADD COLUMN IF NOT EXISTS action_url varchar(255),
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'clicker_challenges_key_uq'
      AND conrelid = 'public.clicker_challenges'::regclass
  ) THEN
    ALTER TABLE public.clicker_challenges
      ADD CONSTRAINT clicker_challenges_key_uq UNIQUE (key);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'clicker_challenges_condition_fk'
      AND conrelid = 'public.clicker_challenges'::regclass
  ) THEN
    ALTER TABLE public.clicker_challenges
      ADD CONSTRAINT clicker_challenges_condition_fk
      FOREIGN KEY (condition_id)
      REFERENCES public.clicker_challenge_conditions(id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.clicker_challenge_progress (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  challenge_id integer NOT NULL REFERENCES public.clicker_challenges(id) ON DELETE CASCADE,
  progress integer NOT NULL DEFAULT 0,
  target integer NOT NULL DEFAULT 1,
  status varchar(32) NOT NULL DEFAULT 'in_progress',
  completed_at timestamptz,
  claimed_at timestamptz,
  last_event_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clicker_challenge_progress_status_chk
    CHECK (status IN ('in_progress', 'completed', 'claimed')),
  CONSTRAINT clicker_challenge_progress_bounds_chk
    CHECK (progress >= 0 AND target > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS clicker_challenge_progress_user_challenge_uq
  ON public.clicker_challenge_progress(user_id, challenge_id);

CREATE INDEX IF NOT EXISTS clicker_challenge_progress_user_status_idx
  ON public.clicker_challenge_progress(user_id, status);

WITH existing AS (
  SELECT condition_id
  FROM public.clicker_challenges
  WHERE key = 'open_cs_case'
),
inserted_condition AS (
  INSERT INTO public.clicker_challenge_conditions (type, target, params)
  SELECT 'case_opened', 1, '{"gameType":"csgo","minTotalCost":0.01}'::jsonb
  WHERE NOT EXISTS (
    SELECT 1 FROM existing WHERE condition_id IS NOT NULL
  )
  RETURNING id
),
condition_row AS (
  SELECT condition_id AS id FROM existing WHERE condition_id IS NOT NULL
  UNION ALL
  SELECT id FROM inserted_condition
  LIMIT 1
)
INSERT INTO public.clicker_challenges (
  key,
  name,
  description,
  points_reward,
  action_url,
  is_active,
  sort_order,
  condition_id
)
SELECT
  'open_cs_case',
  'Open a CS case',
  'Open any paid CS case once.',
  1000,
  '/cases',
  true,
  10,
  id
FROM condition_row
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  points_reward = EXCLUDED.points_reward,
  action_url = EXCLUDED.action_url,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  condition_id = EXCLUDED.condition_id,
  updated_at = now();

UPDATE public.clicker_challenge_conditions condition
SET
  type = 'case_opened',
  target = 1,
  params = '{"gameType":"csgo","minTotalCost":0.01}'::jsonb,
  updated_at = now()
FROM public.clicker_challenges challenge
WHERE challenge.key = 'open_cs_case'
  AND condition.id = challenge.condition_id;

WITH existing AS (
  SELECT condition_id
  FROM public.clicker_challenges
  WHERE key = 'risky_skin_upgrade'
),
inserted_condition AS (
  INSERT INTO public.clicker_challenge_conditions (type, target, params)
  SELECT 'skin_upgrade', 1, '{"minCost":0.5,"maxChancePctExclusive":50}'::jsonb
  WHERE NOT EXISTS (
    SELECT 1 FROM existing WHERE condition_id IS NOT NULL
  )
  RETURNING id
),
condition_row AS (
  SELECT condition_id AS id FROM existing WHERE condition_id IS NOT NULL
  UNION ALL
  SELECT id FROM inserted_condition
  LIMIT 1
)
INSERT INTO public.clicker_challenges (
  key,
  name,
  description,
  points_reward,
  action_url,
  is_active,
  sort_order,
  condition_id
)
SELECT
  'risky_skin_upgrade',
  'Make a risky skin upgrade',
  'Make one skin upgrade with chance below 50% and cost at least $0.50.',
  1000,
  '/upgrade',
  true,
  20,
  id
FROM condition_row
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  points_reward = EXCLUDED.points_reward,
  action_url = EXCLUDED.action_url,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  condition_id = EXCLUDED.condition_id,
  updated_at = now();

UPDATE public.clicker_challenge_conditions condition
SET
  type = 'skin_upgrade',
  target = 1,
  params = '{"minCost":0.5,"maxChancePctExclusive":50}'::jsonb,
  updated_at = now()
FROM public.clicker_challenges challenge
WHERE challenge.key = 'risky_skin_upgrade'
  AND condition.id = challenge.condition_id;

WITH existing AS (
  SELECT condition_id
  FROM public.clicker_challenges
  WHERE key = 'link_telegram'
),
inserted_condition AS (
  INSERT INTO public.clicker_challenge_conditions (type, target, params)
  SELECT 'telegram_linked', 1, '{}'::jsonb
  WHERE NOT EXISTS (
    SELECT 1 FROM existing WHERE condition_id IS NOT NULL
  )
  RETURNING id
),
condition_row AS (
  SELECT condition_id AS id FROM existing WHERE condition_id IS NOT NULL
  UNION ALL
  SELECT id FROM inserted_condition
  LIMIT 1
)
INSERT INTO public.clicker_challenges (
  key,
  name,
  description,
  points_reward,
  action_url,
  is_active,
  sort_order,
  condition_id
)
SELECT
  'link_telegram',
  'Link Telegram',
  'Link Telegram to your profile.',
  1000,
  '/profile',
  true,
  30,
  id
FROM condition_row
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  points_reward = EXCLUDED.points_reward,
  action_url = EXCLUDED.action_url,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  condition_id = EXCLUDED.condition_id,
  updated_at = now();

UPDATE public.clicker_challenge_conditions condition
SET
  type = 'telegram_linked',
  target = 1,
  params = '{}'::jsonb,
  updated_at = now()
FROM public.clicker_challenges challenge
WHERE challenge.key = 'link_telegram'
  AND condition.id = challenge.condition_id;
