// All magic numbers for the clicker module live here. Other files
// import from this barrel so a tuning change is one edit, not a grep.
//
// Anything that changes per-environment (regen rates, idle threshold,
// schedule cadence) is loaded from process.env with a typed default.
// Anything fixed by protocol contract (Lua return arity, hash field
// names) stays inline in the consuming file — those aren't tunables.

// ---- Click hot-path -----------------------------------------------------

/**
 * Max clicks accepted in a single WS `click` batch. The frontend
 * coalesces ~150 ms of activity into one event, so even an autoclicker
 * hitting 30 cps lands well under this. Larger payloads are
 * malformed/abusive and we drop the excess rather than reject.
 */
export const MAX_BATCH_PER_REQUEST = 200

/**
 * Cooldown between WS upgrade-style messages from the same socket.
 * Pure perf shortcut — the upgrade flow itself is row-locked, so
 * concurrency safety doesn't depend on this. Stops a rapid
 * double-tap from hitting Postgres twice.
 */
export const UPGRADE_THROTTLE_MS = 500

/**
 * Maximum drift we accept on the client-supplied click timestamp
 * before treating it as a forgery / clock-skew artifact. Energy regen
 * is server-anchored, so this just blocks `ts: yearAgo` style
 * abuse.
 */
export const MAX_TS_DRIFT_MS = 5 * 60 * 1000

// ---- Redis TTL / keys ---------------------------------------------------

/**
 * 7 days. Idle users with no flushes for a week get evicted from
 * Redis; the next click triggers a lazy reload from Postgres. Way
 * longer than the previous 24 h to avoid forced re-bootstraps that
 * burn ops on the hosted-Redis billing meter.
 */
export const REDIS_USER_KEY_TTL_SECONDS = 7 * 24 * 60 * 60

// ---- Energy regen -------------------------------------------------------

/**
 * Fallback regen rate when (a) there's no per-level rate stamped on
 * the user and (b) the env override is missing. Per-level rates
 * (clicker_energy_levels.target_refill_sec) take precedence — this
 * is just the floor for the bootstrap path before per-level data
 * has been backfilled.
 */
export const DEFAULT_REGEN_PER_SEC_FALLBACK = 0.2

// ---- Autoclicker bank model --------------------------------------------

/**
 * After this many seconds of no manual clicks the autoclicker starts
 * ticking. Production target: 60 s. Dev override via
 * CLICKER_AUTO_CLICKER_IDLE_THRESHOLD_SEC env so testers don't have
 * to literally wait a minute between clicks.
 */
export const DEFAULT_AUTO_CLICKER_IDLE_THRESHOLD_SEC = 60

/**
 * One autoclicker tick every 3 s. Mirrored as `AUTO_TICK_MS = 3000`
 * in the click Lua's local block — kept in lockstep here for the
 * service-level math (cap calculations, etc.).
 */
export const AUTO_CLICKER_TICK_MS = 3000

// ---- Cron flush --------------------------------------------------------

/**
 * One flush per minute. Halves Redis ops vs the older 30-second
 * cadence with negligible UX impact (worst-case sync delay 60 s).
 * Can be tightened on busy deploys via env if needed — kept as a
 * constant here for now.
 */
export const FLUSH_CRON_EXPR = '0 * * * * *'

/**
 * Max users drained from the dirty set in one flush tick. Caps the
 * worst-case round-trip in the cron — a sudden surge of dirty users
 * over the limit just gets handled across multiple ticks.
 */
export const MAX_FLUSH_BATCH = 500

/**
 * In-memory cache TTL for the bunny levels catalog inside the flush
 * service. Long enough that an admin tier add lands within a
 * minute; short enough that the cron isn't reading stale data after
 * a deploy.
 */
export const LEVELS_CACHE_TTL_MS = 60_000
