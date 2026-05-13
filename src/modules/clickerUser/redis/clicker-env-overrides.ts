export type ClickerEnv = Record<string, string | undefined>

const LOCAL_OVERRIDE_FLAG = 'CLICKER_ENABLE_LOCAL_AUTO_CLICKER_OVERRIDE'

/**
 * Developer-only cap override for the autoclicker idle bank.
 *
 * Production must always use the per-level `duration_sec` from
 * clicker_auto_clicker_levels; otherwise a copied local env value like
 * `120` silently turns every real autoclicker tier into a 2-minute cap.
 */
export const readAutoClickerMaxIdleSecOverride = (
  env: ClickerEnv = process.env,
): number => {
  if (env[LOCAL_OVERRIDE_FLAG] !== 'true') return 0
  if (env.NODE_ENV === 'production') return 0

  const raw = env.CLICKER_AUTO_CLICKER_MAX_IDLE_SEC
  if (raw == null || raw === '') return 0

  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return 0

  return parsed
}
