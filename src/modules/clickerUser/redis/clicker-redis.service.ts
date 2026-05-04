import { Inject, Injectable, Logger } from '@nestjs/common'
import Redis from 'ioredis'
import { REDIS_CLIENT } from '../../../core/redis/redis.constants'
import { clickerLog, clickerLogBlock } from '../clicker-debug'
import { CLICK_LUA } from './clicker.lua'
import { CLAIM_AUTO_LUA } from './clicker.lua.claim-auto'
import { DEDUCT_LUA } from './clicker.deduct.lua'
import { ACTIVATE_BOOST_LUA } from './clicker.activate-boost.lua'
import {
  DEFAULT_AUTO_CLICKER_IDLE_THRESHOLD_SEC,
  DEFAULT_REGEN_PER_SEC_FALLBACK,
  REDIS_USER_KEY_TTL_SECONDS,
} from '../constants/clicker.constants'

/**
 * Lua return codes shared by activate-boost / claim-auto-clicker.
 * Positive integers are the activation deadline (ms-since-epoch) for
 * activate-boost; for claim-auto-clicker positive returns ride in the
 * tuple's secondary slots (count/value), so the meaning here is
 * activate-boost-only.
 */
export const ACTIVATE_META_MISSING = -1
export const ACTIVATE_ALREADY_RUNNING = -2

// Env-overridable runtime knobs. Defaults pull from the constants file
// so the *value* is owned in one place; only the env-binding logic
// lives here.
const ENERGY_REGEN_PER_SEC = (() => {
  const raw = process.env.CLICKER_ENERGY_REGEN_PER_SEC
  if (raw == null || raw === '') return DEFAULT_REGEN_PER_SEC_FALLBACK
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0)
    return DEFAULT_REGEN_PER_SEC_FALLBACK
  return parsed
})()

const AUTO_CLICKER_IDLE_THRESHOLD_SEC = (() => {
  const raw = process.env.CLICKER_AUTO_CLICKER_IDLE_THRESHOLD_SEC
  if (raw == null || raw === '')
    return DEFAULT_AUTO_CLICKER_IDLE_THRESHOLD_SEC
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0)
    return DEFAULT_AUTO_CLICKER_IDLE_THRESHOLD_SEC
  return parsed
})()
const AUTO_CLICKER_IDLE_THRESHOLD_MS = AUTO_CLICKER_IDLE_THRESHOLD_SEC * 1000

/**
 * Test override for the autoclicker accumulation cap. When set to a
 * positive number, OVERRIDES the per-level `duration_sec` from the DB.
 * Lets us reproduce 4 h cap bugs without literally idling for 4 h —
 * `CLICKER_AUTO_CLICKER_MAX_IDLE_SEC=300` reproduces a 5-min cap.
 *
 * `0` (or unset) keeps the per-level value untouched. Negative or
 * non-numeric falls back too — never break prod on a typo.
 */
const AUTO_CLICKER_MAX_IDLE_SEC_OVERRIDE = (() => {
  const raw = process.env.CLICKER_AUTO_CLICKER_MAX_IDLE_SEC
  if (raw == null || raw === '') return 0
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return 0
  return parsed
})()

export interface ClickerMetaInput {
  cost: number
  max_energy: number
  level_id: number
  click_level_id: number
  energy_level_id: number
  /** Points threshold for the next bunny level. 0 = max level. */
  next_level_cost: number
  /**
   * Crit chance percent (0-100). 0 means crit-click skill not unlocked
   * yet — Lua skips the roll loop entirely in that case (perf shortcut).
   */
  crit_chance_pct: number
  /**
   * Autoclicker max idle accumulation seconds. 0 = autoclicker not
   * unlocked. Drives the cap inside the click Lua's idle-bank loop.
   */
  auto_clicker_max_idle_sec: number
  /**
   * Per-level regen rate in milli-units per second (units/sec × 1000).
   * Set when the user's energy_level row carries a non-zero
   * `regen_per_sec_milli`; bootstrap falls back to the global env
   * override when this is 0 (pre-migration row).
   */
  regen_per_sec_milli: number
}

export interface ClickerStateSnapshot {
  points: number | null
  /**
   * Lifetime carrots earned. Read alongside `points` so the flush can
   * persist the monotonic tally back to Postgres — without it, a
   * Redis eviction would reset the lifetime counter to whatever PG
   * last had, undoing any in-session level progress.
   */
  total_points: number | null
  energy: number | null
  ts: number | null
  /**
   * Bank-style autoclicker state — flushed to Postgres alongside the
   * regular state so a Redis eviction doesn't lose the player's
   * pending earnings.
   */
  auto_clicker_pending_count: number | null
  auto_clicker_pending_value: number | null
}

export interface LuaClickResult {
  meta_missing: boolean
  accepted: number
  points: number
  /** Lifetime monotonic tally; spending leaves it untouched. */
  total_points: number
  energy: number
  max_energy: number
  cost: number
  level_id: number
  click_level_id: number
  energy_level_id: number
  level_up_due: boolean
  /** Energy units per 1000 ms — surfaced for client-side extrapolation. */
  regen_milli: number
  /** How many of the accepted manual clicks landed a crit (10× payout). */
  crit_count: number
  /**
   * Autoclicker ticks credited DURING this Lua call (not cumulative).
   * Useful for the frontend to flash a "+N" indicator on the autoclicker
   * UpgradeBox without needing to diff `auto_clicker_pending_count`
   * across acks.
   */
  auto_credited: number
  /**
   * Autoclicker accumulation start ms (0 = not currently accumulating).
   * Drives the "elapsed since accumulation started" countdown in the
   * claim modal.
   */
  auto_clicker_started_at_ms: number
  /** Max idle accumulation seconds (= owned tier's `duration_sec`). */
  auto_clicker_max_idle_sec: number
  /** Pending click count waiting to be claimed. */
  auto_clicker_pending_count: number
  /** Pending click value (points) waiting to be claimed. */
  auto_clicker_pending_value: number
  /**
   * Diagnostic block populated from the Lua return tuple. Used by the
   * Ghost-mode debug logger to surface every internal decision the
   * Lua made (which window was simulated, how many ticks fired, how
   * outer regen filled energy). Ignore in production code paths —
   * these are read by the logger only.
   */
  dbg: LuaClickDiagnostics
}

/**
 * Diagnostic block returned alongside every Lua click result. All
 * fields are zero when the Lua either short-circuited (meta missing)
 * or didn't engage the relevant block (e.g. autoclicker disabled).
 *
 * Field-order in the Lua return tuple MUST match the destructuring
 * inside parseClickResult below — adding or reordering fields here
 * means editing both the Lua and the parser.
 */
export interface LuaClickDiagnostics {
  /** Snapshot of points BEFORE this Lua call applied any mutations. */
  points_before: number
  /** Snapshot of energy BEFORE outer regen + autoclicker block. */
  energy_before: number
  /** Snapshot of `t` (regen anchor ts ms) BEFORE the call. */
  last_ts_before: number
  /** Snapshot of `lc` (last manual click ms) BEFORE this call. */
  lc_before: number
  /** Snapshot of `as` (ac_start ms) BEFORE this call. */
  ac_start_before: number
  /** Snapshot of `ac` (ac_last ms) BEFORE this call. */
  ac_last_before: number
  /** Snapshot of `apc` BEFORE this call. */
  apc_before: number
  /** Snapshot of `apv` BEFORE this call. */
  apv_before: number
  /** Snapshot of `tp` BEFORE this call. */
  tp_before: number
  /** dt_ms used by the OUTER (non-tick) regen calculation. */
  outer_regen_dt_ms: number
  /** Raw computed regen units BEFORE clamping to headroom. */
  outer_regen_computed_raw: number
  /** Energy units actually credited by the outer regen (post-headroom). */
  outer_regen_units_applied: number
  /** ms consumed by the outer regen (anchored into persisted_ts). */
  outer_regen_ms_used: number
  /** `now - lc` at the moment the autoclicker idle gate was evaluated. */
  idle_dt_at_check: number
  /** 1 when this Lua call STARTED a fresh autoclicker cycle. */
  ac_started_this_call: number
  /** Computed cap timestamp (ac_start + ac_max_idle*1000); 0 when not engaged. */
  cap_at: number
  /** min(now, cap_at) actually used as upper bound for the inner loop. */
  effective_now_used: number
  /** max(ac_last, lc + idle_threshold) actually used as lower bound. */
  sim_from_used: number
  /** Inner-loop iteration count (== how many tick attempts). */
  ticks_attempted: number
  /** Inner-loop iterations that actually credited a click (energy >= cost). */
  ticks_succeeded: number
  /** Total energy units regenerated INSIDE the per-tick loop. */
  inner_regen_total: number
}

export interface LuaClaimResult {
  meta_missing: boolean
  /** Number of clicks that were claimed (0 when nothing to claim). */
  claimed_count: number
  /** Points credited to the balance from this claim (0 when nothing). */
  claimed_value: number
  /** New post-claim points balance (already includes the credit). */
  points: number
  /** New post-claim lifetime tally (already includes the credit). */
  total_points: number
  /**
   * 1 when the credit pushed tp past `nl` (next level threshold) — the
   * engine must run the standard flush + meta refresh. 0 in the no-op
   * case (apv=0 → no credit → no level move possible).
   */
  level_up_due: boolean
  /** Diagnostic block. See LuaClaimDiagnostics. */
  dbg: LuaClaimDiagnostics
}

export interface LuaClaimDiagnostics {
  /** Snapshot of `lc` BEFORE the claim wrote `lc=now`. */
  lc_before: number
  /** Snapshot of `as` (ac_start) BEFORE the claim reset it to 0. */
  ac_start_before: number
  /** Snapshot of `ac` (ac_last) BEFORE the claim reset it to 0. */
  ac_last_before: number
}

@Injectable()
export class ClickerRedisService {
  private readonly logger = new Logger(ClickerRedisService.name)

  // SCRIPT LOAD result, used with EVALSHA. Cleared and re-loaded on
  // NOSCRIPT (Redis was restarted / FLUSH'd).
  private clickShaPromise: Promise<string> | null = null
  private deductShaPromise: Promise<string> | null = null
  private claimAutoShaPromise: Promise<string> | null = null
  private activateBoostShaPromise: Promise<string> | null = null

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * `clicker:v5:u:{userId}` — versioned prefix. Bumping the version
   * invalidates all per-user hashes from previous deploys: the lookup
   * misses, bootstrap re-reads from Postgres, meta fields (cost,
   * regen rate, level caps) are written fresh.
   *
   * v4 → v5 was needed for the lifetime `tp` (total_points) field —
   * the level-up gate now reads from it, and warm v4 hashes wouldn't
   * have it populated, so the gate would mis-fire on the first call
   * (tp=0 < ncost regardless of actual lifetime). Bumping forces a
   * bootstrap that pulls the backfilled value from Postgres.
   *
   * Old keys go orphan and expire on their TTL (7d). Pending unflushed
   * state in v4 is lost on bump — production deploys should drain the
   * dirty set first; locally it's a non-issue.
   */
  private userKey(userId: number): string {
    return `clicker:v5:u:${userId}`
  }

  private get dirtyKey(): string {
    return 'clicker:v5:dirty'
  }

  private async loadScript(): Promise<string> {
    if (!this.clickShaPromise) {
      this.clickShaPromise = (
        this.redis.script('LOAD', CLICK_LUA) as Promise<string>
      ).catch(err => {
        this.clickShaPromise = null
        throw err
      })
    }
    return this.clickShaPromise
  }

  private async loadDeductScript(): Promise<string> {
    if (!this.deductShaPromise) {
      this.deductShaPromise = (
        this.redis.script('LOAD', DEDUCT_LUA) as Promise<string>
      ).catch(err => {
        this.deductShaPromise = null
        throw err
      })
    }
    return this.deductShaPromise
  }

  private async loadClaimAutoScript(): Promise<string> {
    if (!this.claimAutoShaPromise) {
      this.claimAutoShaPromise = (
        this.redis.script('LOAD', CLAIM_AUTO_LUA) as Promise<string>
      ).catch(err => {
        this.claimAutoShaPromise = null
        throw err
      })
    }
    return this.claimAutoShaPromise
  }

  /**
   * Atomically claim the autoclicker pending bank. Adds `apv` to the
   * player's points, zeroes pending state and the accumulation cycle,
   * stamps `lc=now` so the next accumulation only kicks in after
   * another idle window. Concurrent calls are race-safe — Lua runs
   * single-threaded, so the second tap reads apc=0 and gets a no-op
   * back.
   *
   * Returns `meta_missing: true` when the user hash is cold; caller
   * bootstraps and retries.
   */
  async claimAutoClicker(
    userId: number,
    nowMs: number,
  ): Promise<LuaClaimResult> {
    const ukey = this.userKey(userId)
    const args = [String(userId), String(nowMs)]

    let raw: unknown
    try {
      const sha = await this.loadClaimAutoScript()
      raw = await this.redis.evalsha(sha, 2, ukey, this.dirtyKey, ...args)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('NOSCRIPT')) {
        this.claimAutoShaPromise = null
        raw = await this.redis.eval(
          CLAIM_AUTO_LUA,
          2,
          ukey,
          this.dirtyKey,
          ...args,
        )
      } else {
        throw err
      }
    }

    const result = this.parseClaimResult(raw)

    // Ghost-mode: confirms which cycle just got cleared (the lc/as/ac
    // that the claim wiped) and how much was credited.
    clickerLogBlock(
      'claim',
      { user: userId, op: 'claim-auto', now: nowMs },
      [
        ['before', {
          lc: result.dbg.lc_before,
          as: result.dbg.ac_start_before,
          ac: result.dbg.ac_last_before,
        }],
        ['result', {
          claimed_count: result.claimed_count,
          claimed_value: result.claimed_value,
          points_after: result.points,
          tp_after: result.total_points,
          meta_missing: result.meta_missing,
        }],
      ],
    )

    return result
  }

  private parseClaimResult(raw: unknown): LuaClaimResult {
    // 9 = full protocol with level_up_due + diagnostic block. Older
    // deploys returned 5 (no level_up_due, no dbg) or 8 (dbg only);
    // we tolerate both so a partial rollout doesn't crash the parser.
    // Missing fields fall back to 0 — safe defaults for everything.
    if (!Array.isArray(raw) || raw.length < 5) {
      throw new Error('clicker claim lua: malformed return value')
    }
    const arr = raw as Array<string | number>
    const num = (i: number) => {
      const v = arr[i]
      const n = typeof v === 'string' ? Number(v) : v
      return Number.isFinite(n) ? Number(n) : 0
    }
    // Diagnostic offset depends on whether `level_up_due` was present.
    // Length 9 (current) → dbg starts at index 6.
    // Length 8 (intermediate) → no level_up_due, dbg starts at 5.
    // Length 5 (original) → no dbg either.
    const hasLevelUp = arr.length >= 9
    const dbgOffset = hasLevelUp ? 6 : 5
    return {
      meta_missing: num(0) === 1,
      claimed_count: num(1),
      claimed_value: num(2),
      points: num(3),
      total_points: num(4),
      level_up_due: hasLevelUp ? num(5) === 1 : false,
      dbg: {
        lc_before: num(dbgOffset),
        ac_start_before: num(dbgOffset + 1),
        ac_last_before: num(dbgOffset + 2),
      },
    }
  }

  private async loadActivateBoostScript(): Promise<string> {
    if (!this.activateBoostShaPromise) {
      this.activateBoostShaPromise = (
        this.redis.script('LOAD', ACTIVATE_BOOST_LUA) as Promise<string>
      ).catch(err => {
        this.activateBoostShaPromise = null
        throw err
      })
    }
    return this.activateBoostShaPromise
  }

  /**
   * Activate a consumable boost. Caller MUST have decremented the
   * inventory in PG first — this script is idempotent on the Redis
   * side but doesn't know about inventory state.
   *
   * Returns the activation deadline (ms-since-epoch) on success, or
   * ACTIVATE_* constants on rejection (caller should refund the
   * inventory in that case).
   */
  async activateBoost(
    userId: number,
    nowMs: number,
    durationSec: number,
    effectType: string,
    effectValue: number,
    boostKey: string,
  ): Promise<number> {
    const ukey = this.userKey(userId)
    const args = [
      String(nowMs),
      String(Math.max(0, Math.floor(durationSec))),
      effectType,
      String(Math.max(0, Math.floor(effectValue))),
      boostKey,
    ]

    let raw: unknown
    try {
      const sha = await this.loadActivateBoostScript()
      raw = await this.redis.evalsha(sha, 1, ukey, ...args)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('NOSCRIPT')) {
        this.activateBoostShaPromise = null
        raw = await this.redis.eval(ACTIVATE_BOOST_LUA, 1, ukey, ...args)
      } else {
        throw err
      }
    }

    const n = typeof raw === 'string' ? Number(raw) : (raw as number)
    return Number.isFinite(n) ? n : ACTIVATE_META_MISSING
  }

  /**
   * Atomically subtract `cost` from a user's points. Caller must ensure
   * the user is bootstrapped first (run `runClick(user, 0, now)` if
   * unsure) — otherwise this returns -2.
   *
   * Returns: new balance on success, -1 if insufficient, -2 if state
   * not loaded.
   */
  async deductPoints(userId: number, cost: number): Promise<number> {
    const ukey = this.userKey(userId)
    const args = [String(userId), String(Math.max(0, Math.floor(cost)))]

    let raw: unknown
    try {
      const sha = await this.loadDeductScript()
      raw = await this.redis.evalsha(sha, 2, ukey, this.dirtyKey, ...args)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('NOSCRIPT')) {
        this.deductShaPromise = null
        raw = await this.redis.eval(
          DEDUCT_LUA,
          2,
          ukey,
          this.dirtyKey,
          ...args,
        )
      } else {
        throw err
      }
    }

    const n = typeof raw === 'string' ? Number(raw) : (raw as number)
    return Number.isFinite(n) ? n : -1
  }

  /**
   * Run a click batch atomically. If the per-user meta is missing in Redis
   * (cold cache / TTL expired / cleared by upgrade), returns
   * `meta_missing: true` and the caller must hydrate via {@link bootstrap}
   * and retry once.
   */
  async runClick(
    userId: number,
    count: number,
    nowMs: number,
  ): Promise<LuaClickResult> {
    const ukey = this.userKey(userId)
    const reqCount = Math.max(0, Math.floor(count))
    const args = [
      String(userId),
      String(reqCount),
      String(nowMs),
      String(AUTO_CLICKER_IDLE_THRESHOLD_MS),
    ]

    let raw: unknown
    try {
      const sha = await this.loadScript()
      raw = await this.redis.evalsha(sha, 2, ukey, this.dirtyKey, ...args)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('NOSCRIPT')) {
        this.clickShaPromise = null
        raw = await this.redis.eval(CLICK_LUA, 2, ukey, this.dirtyKey, ...args)
      } else {
        throw err
      }
    }

    const result = this.parseLuaResult(raw)

    // Ghost-mode dump of every Lua decision: which window was
    // simulated, how outer/inner regen interacted, before→after diff.
    // The clickerLogBlock helper short-circuits when CLICKER_DEBUG is
    // off, so this is free in production.
    clickerLogBlock(
      'lua',
      {
        user: userId,
        op: reqCount > 0 ? 'click' : 'status',
        req: reqCount,
        now: nowMs,
      },
      [
        ['before', {
          p: result.dbg.points_before,
          e: result.dbg.energy_before,
          t: result.dbg.last_ts_before,
          lc: result.dbg.lc_before,
          as: result.dbg.ac_start_before,
          ac: result.dbg.ac_last_before,
          apc: result.dbg.apc_before,
          apv: result.dbg.apv_before,
          tp: result.dbg.tp_before,
        }],
        ['outer-regen', {
          dt_ms: result.dbg.outer_regen_dt_ms,
          computed_raw: result.dbg.outer_regen_computed_raw,
          units_applied: result.dbg.outer_regen_units_applied,
          ms_used: result.dbg.outer_regen_ms_used,
        }],
        ['autoclick', {
          ad_sec: result.auto_clicker_max_idle_sec,
          idle_dt_ms: result.dbg.idle_dt_at_check,
          started_this_call: result.dbg.ac_started_this_call,
          cap_at: result.dbg.cap_at,
          eff_now: result.dbg.effective_now_used,
          sim_from: result.dbg.sim_from_used,
          ticks_attempted: result.dbg.ticks_attempted,
          ticks_succeeded: result.dbg.ticks_succeeded,
          inner_regen_total: result.dbg.inner_regen_total,
          auto_credited: result.auto_credited,
        }],
        ['manual', {
          accepted: result.accepted,
          crit_count: result.crit_count,
          cost: result.cost,
        }],
        ['after', {
          p: result.points,
          e: result.energy,
          max_e: result.max_energy,
          regen_milli: result.regen_milli,
          apc: result.auto_clicker_pending_count,
          apv: result.auto_clicker_pending_value,
          tp: result.total_points,
          as: result.auto_clicker_started_at_ms,
          level_up_due: result.level_up_due,
          meta_missing: result.meta_missing,
        }],
      ],
    )

    return result
  }

  private parseLuaResult(raw: unknown): LuaClickResult {
    // 18 = the original protocol fields. The diagnostic block (39
    // total) is appended; older Lua scripts (before instrumentation
    // landed) still return 18 — fall back to zero-valued dbg in that
    // case so a partial deploy doesn't crash the parser.
    if (!Array.isArray(raw) || raw.length < 18) {
      throw new Error('clicker lua: malformed return value')
    }
    const arr = raw as Array<string | number>
    const num = (i: number) => {
      const v = arr[i]
      const n = typeof v === 'string' ? Number(v) : v
      return Number.isFinite(n) ? Number(n) : 0
    }
    return {
      meta_missing: num(0) === 1,
      accepted: num(1),
      points: num(2),
      energy: num(3),
      max_energy: num(4),
      cost: num(5),
      level_id: num(6),
      click_level_id: num(7),
      energy_level_id: num(8),
      level_up_due: num(9) === 1,
      regen_milli: num(10),
      crit_count: num(11),
      auto_credited: num(12),
      auto_clicker_started_at_ms: num(13),
      auto_clicker_max_idle_sec: num(14),
      auto_clicker_pending_count: num(15),
      auto_clicker_pending_value: num(16),
      total_points: num(17),
      dbg: {
        points_before: num(18),
        energy_before: num(19),
        last_ts_before: num(20),
        lc_before: num(21),
        ac_start_before: num(22),
        ac_last_before: num(23),
        apc_before: num(24),
        apv_before: num(25),
        tp_before: num(26),
        outer_regen_dt_ms: num(27),
        outer_regen_computed_raw: num(28),
        outer_regen_units_applied: num(29),
        outer_regen_ms_used: num(30),
        idle_dt_at_check: num(31),
        ac_started_this_call: num(32),
        cap_at: num(33),
        effective_now_used: num(34),
        sim_from_used: num(35),
        ticks_attempted: num(36),
        ticks_succeeded: num(37),
        inner_regen_total: num(38),
      },
    }
  }

  /**
   * Hydrate Redis from Postgres for one user. State fields (p/e/t) use
   * HSETNX to avoid clobbering a value that a parallel handler already
   * accumulated; meta fields are unconditional since Postgres is the
   * canonical source for them.
   *
   * EXPIRE is set here (and only here) — the Lua hot path doesn't touch
   * TTL, saving one op per click. The week-long TTL means a typical
   * active user never re-bootstraps anyway.
   */
  async bootstrap(
    userId: number,
    state: {
      points: number
      total_points: number
      energy: number
      ts: number
      auto_clicker_pending_count: number
      auto_clicker_pending_value: number
    },
    meta: ClickerMetaInput,
  ): Promise<void> {
    const ukey = this.userKey(userId)
    // Per-level regen takes precedence; env-driven fallback applies
    // only when the energy_level row hasn't been backfilled.
    const fallbackRegenMilli = Math.max(0, Math.floor(ENERGY_REGEN_PER_SEC * 1000))
    const regenMilli =
      meta.regen_per_sec_milli > 0 ? meta.regen_per_sec_milli : fallbackRegenMilli
    const pipe = this.redis.multi()
    pipe.hsetnx(ukey, 'p', String(state.points))
    // Lifetime tally — restored from PG. The Lua hot path bumps it
    // alongside `p` on every credit; on Redis eviction the flushed
    // value comes back here. HSETNX so a parallel credit landed
    // between bootstrap-trigger and now isn't clobbered.
    pipe.hsetnx(ukey, 'tp', String(state.total_points))
    pipe.hsetnx(ukey, 'e', String(state.energy))
    pipe.hsetnx(ukey, 't', String(state.ts))
    // Restore pending bank from Postgres. HSETNX so we don't clobber a
    // value already accumulated in Redis between the bootstrap-trigger
    // and now.
    pipe.hsetnx(ukey, 'apc', String(state.auto_clicker_pending_count))
    pipe.hsetnx(ukey, 'apv', String(state.auto_clicker_pending_value))
    // `lc` (last manual click) seeds at the ts we just read — treats
    // the bootstrap moment as "just clicked", so a freshly-loaded user
    // doesn't immediately start accumulating before they've actually
    // gone idle. Same for `as`/`ac` which start at 0.
    pipe.hsetnx(ukey, 'lc', String(state.ts))
    pipe.hsetnx(ukey, 'as', '0')
    pipe.hsetnx(ukey, 'ac', '0')
    // Test override for the autoclicker cap — see the env-parser at
    // the top of this file. 0 (the default) means "use the per-level
    // value as-is".
    const autoMaxIdleSec =
      AUTO_CLICKER_MAX_IDLE_SEC_OVERRIDE > 0
        ? AUTO_CLICKER_MAX_IDLE_SEC_OVERRIDE
        : meta.auto_clicker_max_idle_sec
    pipe.hset(ukey, {
      c: String(meta.cost),
      m: String(meta.max_energy),
      r: String(regenMilli),
      l: String(meta.level_id),
      cl: String(meta.click_level_id),
      el: String(meta.energy_level_id),
      nl: String(meta.next_level_cost),
      cc: String(meta.crit_chance_pct),
      ad: String(autoMaxIdleSec),
    })
    pipe.expire(ukey, REDIS_USER_KEY_TTL_SECONDS)
    await pipe.exec()

    // Ghost-mode: surfaces the EXACT value of `ad` (cap seconds) and
    // `r` (regen milli) the next Lua call will read. If the env
    // override didn't take effect, you'll see `ad_written != ad_env`
    // here immediately — no need to peek into Redis manually.
    clickerLogBlock(
      'bootstrap',
      { user: userId, op: 'redis-write' },
      [
        ['state-init', {
          p: state.points,
          tp: state.total_points,
          e: state.energy,
          t: state.ts,
          apc: state.auto_clicker_pending_count,
          apv: state.auto_clicker_pending_value,
        }],
        ['meta-write', {
          c: meta.cost,
          m: meta.max_energy,
          r_milli: regenMilli,
          regen_per_sec_resolved: regenMilli / 1000,
          regen_per_sec_meta: meta.regen_per_sec_milli / 1000,
          regen_per_sec_fallback: ENERGY_REGEN_PER_SEC,
          l: meta.level_id,
          cl: meta.click_level_id,
          el: meta.energy_level_id,
          nl: meta.next_level_cost,
          cc: meta.crit_chance_pct,
          ad_db: meta.auto_clicker_max_idle_sec,
          ad_env_override: AUTO_CLICKER_MAX_IDLE_SEC_OVERRIDE,
          ad_written: autoMaxIdleSec,
          idle_threshold_sec: AUTO_CLICKER_IDLE_THRESHOLD_SEC,
          ttl_sec: REDIS_USER_KEY_TTL_SECONDS,
        }],
      ],
    )
  }

  async getState(userId: number): Promise<ClickerStateSnapshot> {
    const arr = await this.redis.hmget(
      this.userKey(userId),
      'p',
      'tp',
      'e',
      't',
      'apc',
      'apv',
    )
    return {
      points: arr[0] == null ? null : Number(arr[0]),
      total_points: arr[1] == null ? null : Number(arr[1]),
      energy: arr[2] == null ? null : Number(arr[2]),
      ts: arr[3] == null ? null : Number(arr[3]),
      auto_clicker_pending_count: arr[4] == null ? null : Number(arr[4]),
      auto_clicker_pending_value: arr[5] == null ? null : Number(arr[5]),
    }
  }

  /**
   * Wipe the entire user hash. Used after upgrades, where the canonical
   * state has just been written to Postgres and the next click should
   * lazy-load from there rather than reuse the now-stale Redis copy.
   */
  async clearUser(userId: number): Promise<void> {
    await this.redis.del(this.userKey(userId))
    await this.redis.srem(this.dirtyKey, String(userId))
    clickerLog('redis-clear-user', { user: userId, op: 'DEL+SREM' })
  }

  /**
   * Atomic level-only meta update. Writes `l` (level_id) and `nl`
   * (next_level_cost) in one HMSET so the new bunny rank lands without
   * tearing — concurrent Lua reads see either the pre- or post-promotion
   * pair, never one of each. Click levels / energy levels / skill caps
   * don't change on a bunny promotion, so we don't touch them here.
   *
   * Replaces the older "clearMeta + bootstrap" dance which left a
   * window where Lua read meta_missing=true and triggered a redundant
   * PG round-trip per click, plus could race a parallel flush whose
   * own bootstrap then overwrote the post-promotion state with a
   * stale snapshot.
   */
  async updateLevelMeta(
    userId: number,
    levelId: number,
    nextLevelCost: number,
  ): Promise<void> {
    await this.redis.hmset(
      this.userKey(userId),
      'l',
      String(Math.max(0, Math.floor(levelId))),
      'nl',
      String(Math.max(0, Math.floor(nextLevelCost))),
    )
    clickerLog('redis-update-level-meta', {
      user: userId,
      op: 'HMSET l nl',
      level_id: levelId,
      next_level_cost: nextLevelCost,
    })
  }

  async drainDirty(maxBatch: number): Promise<number[]> {
    if (maxBatch <= 0) return []
    const result = await this.redis.spop(this.dirtyKey, maxBatch)
    if (result == null) return []
    const arr = Array.isArray(result) ? result : [result]
    return arr
      .map(v => Number(v))
      .filter(v => Number.isFinite(v) && v > 0)
  }

  async markDirtyMany(userIds: number[]): Promise<void> {
    if (userIds.length === 0) return
    await this.redis.sadd(this.dirtyKey, ...userIds.map(id => String(id)))
  }

  async removeFromDirty(userId: number): Promise<void> {
    await this.redis.srem(this.dirtyKey, String(userId))
  }
}
