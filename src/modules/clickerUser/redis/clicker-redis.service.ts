import { Inject, Injectable, Logger } from '@nestjs/common'
import Redis from 'ioredis'
import { REDIS_CLIENT } from '../../../core/redis/redis.constants'
import { CLICK_LUA } from './clicker.lua'
import { DEDUCT_LUA } from './clicker.deduct.lua'

// 7 days. Idle users with no flushes for a week get evicted from Redis;
// the next click triggers a lazy reload from Postgres. Way longer than
// the previous 24h to avoid forced re-bootstraps that consume ops.
const TTL_SECONDS = 7 * 24 * 60 * 60

const DEFAULT_REGEN_PER_SEC = 1
const ENERGY_REGEN_PER_SEC = (() => {
  const raw = process.env.CLICKER_ENERGY_REGEN_PER_SEC
  if (raw == null || raw === '') return DEFAULT_REGEN_PER_SEC
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_REGEN_PER_SEC
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
}

export interface ClickerStateSnapshot {
  points: number | null
  energy: number | null
  ts: number | null
}

export interface LuaClickResult {
  meta_missing: boolean
  accepted: number
  points: number
  energy: number
  max_energy: number
  cost: number
  level_id: number
  click_level_id: number
  energy_level_id: number
  level_up_due: boolean
  /** Energy units per 1000 ms — surfaced for client-side extrapolation. */
  regen_milli: number
  /** How many of the accepted clicks landed a crit (10× payout). */
  crit_count: number
}

@Injectable()
export class ClickerRedisService {
  private readonly logger = new Logger(ClickerRedisService.name)

  // SCRIPT LOAD result, used with EVALSHA. Cleared and re-loaded on
  // NOSCRIPT (Redis was restarted / FLUSH'd).
  private clickShaPromise: Promise<string> | null = null
  private deductShaPromise: Promise<string> | null = null

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * `clicker:v2:u:{userId}` — versioned prefix. The previous schema used four
   * separate keys per user; this one collapses them into a single hash. The
   * v2 tag keeps the migration risk-free: on first run we read v2, miss,
   * lazy-load from Postgres into v2, and the old v1 keys expire on their
   * own (or get cleaned manually).
   */
  private userKey(userId: number): string {
    return `clicker:v2:u:${userId}`
  }

  private get dirtyKey(): string {
    return 'clicker:v2:dirty'
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
    if (!Array.isArray(raw) || raw.length < 12) {
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
    state: { points: number; energy: number; ts: number },
    meta: ClickerMetaInput,
  ): Promise<void> {
    const ukey = this.userKey(userId)
    const regenMilli = Math.max(0, Math.floor(ENERGY_REGEN_PER_SEC * 1000))
    const pipe = this.redis.multi()
    pipe.hsetnx(ukey, 'p', String(state.points))
    pipe.hsetnx(ukey, 'e', String(state.energy))
    pipe.hsetnx(ukey, 't', String(state.ts))
    pipe.hset(ukey, {
      c: String(meta.cost),
      m: String(meta.max_energy),
      r: String(regenMilli),
      l: String(meta.level_id),
      cl: String(meta.click_level_id),
      el: String(meta.energy_level_id),
      nl: String(meta.next_level_cost),
      cc: String(meta.crit_chance_pct),
    })
    pipe.expire(ukey, TTL_SECONDS)
    await pipe.exec()
  }

  async getState(userId: number): Promise<ClickerStateSnapshot> {
    const arr = await this.redis.hmget(this.userKey(userId), 'p', 'e', 't')
    return {
      points: arr[0] == null ? null : Number(arr[0]),
      energy: arr[1] == null ? null : Number(arr[1]),
      ts: arr[2] == null ? null : Number(arr[2]),
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
   * Drop only the meta fields (c/m/r/l/cl/el/nl/cc), preserving live
   * state (p/e/t). Used after a cron-driven level-up so the next click
   * reloads fresh `level_id` / `next_level_cost` / crit chance without
   * disturbing accumulated points/energy.
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
