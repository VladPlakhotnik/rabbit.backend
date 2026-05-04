import { Inject, Injectable, Logger } from '@nestjs/common'
import Redis from 'ioredis'
import { REDIS_CLIENT } from '../../../core/redis/redis.constants'
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
}

export interface LuaClaimResult {
  meta_missing: boolean
  /** Number of clicks that were claimed (0 when nothing to claim). */
  claimed_count: number
  /** Points credited to the balance from this claim (0 when nothing). */
  claimed_value: number
  /** New post-claim points balance. */
  points: number
  /** Lifetime tally — unchanged by claim, surfaced for ack consistency. */
  total_points: number
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

    return this.parseClaimResult(raw)
  }

  private parseClaimResult(raw: unknown): LuaClaimResult {
    if (!Array.isArray(raw) || raw.length < 5) {
      throw new Error('clicker claim lua: malformed return value')
    }
    const arr = raw as Array<string | number>
    const num = (i: number) => {
      const v = arr[i]
      const n = typeof v === 'string' ? Number(v) : v
      return Number.isFinite(n) ? Number(n) : 0
    }
    return {
      meta_missing: num(0) === 1,
      claimed_count: num(1),
      claimed_value: num(2),
      points: num(3),
      total_points: num(4),
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
    const args = [
      String(userId),
      String(Math.max(0, Math.floor(count))),
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

    return this.parseLuaResult(raw)
  }

  private parseLuaResult(raw: unknown): LuaClickResult {
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
    pipe.hset(ukey, {
      c: String(meta.cost),
      m: String(meta.max_energy),
      r: String(regenMilli),
      l: String(meta.level_id),
      cl: String(meta.click_level_id),
      el: String(meta.energy_level_id),
      nl: String(meta.next_level_cost),
      cc: String(meta.crit_chance_pct),
      ad: String(meta.auto_clicker_max_idle_sec),
    })
    pipe.expire(ukey, REDIS_USER_KEY_TTL_SECONDS)
    await pipe.exec()
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
  }

  /**
   * Drop only the meta fields (c/m/r/l/cl/el/nl/cc/ad), preserving live
   * state (p/e/t and the autoclicker bank). Used after a cron-driven
   * level-up so the next click reloads fresh `level_id` /
   * `next_level_cost` / crit chance / autoclicker cap without
   * disturbing accumulated points / energy / pending.
   */
  async clearMeta(userId: number): Promise<void> {
    await this.redis.hdel(
      this.userKey(userId),
      'c',
      'm',
      'r',
      'l',
      'cl',
      'el',
      'nl',
      'cc',
      'ad',
    )
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
