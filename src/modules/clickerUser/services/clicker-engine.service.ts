import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { ClickerUser } from '../entities/clicker_user.entity'
import { ClickerRedisService } from '../redis/clicker-redis.service'
import { ClickerFlushService } from '../redis/clicker-flush.service'
import { ClickerLevelsCacheService } from './clicker-levels-cache.service'
import { ClickerMetricsService } from './clicker-metrics.service'
import { MAX_BATCH_PER_REQUEST } from '../constants/clicker.constants'
import { clickerLog, clickerLogBlock } from '../clicker-debug'
import { ClickerHistoryService } from '../../clickerHistory/clicker-history.service'

/**
 * Result shape returned to the gateway / sibling services. All fields
 * are absolute current values (post-batch), not deltas.
 */
export interface ClickResult {
  accepted: number
  points: number
  /**
   * Lifetime carrots earned. Monotonically increases on credits;
   * spending only touches `points`. The frontend reads this for the
   * progress-bar fill so the bar doesn't visibly regress when the
   * player buys a case.
   */
  total_points: number
  energy: number
  max_energy: number
  cost: number
  /** Energy units per second. 0 means regeneration disabled. */
  regen_per_sec: number
  level_id: number | null
  click_level_id: number | null
  energy_level_id: number | null
  /** Number of accepted clicks in this batch that landed a 10× crit. */
  crit_count: number
  /**
   * Autoclicker ticks credited to the pending bank during this batch
   * (NOT cumulative — just this call). Frontend uses this for a "+N"
   * flash on the box; it's redundant with the diff of
   * `auto_clicker_pending_count` across acks but cheaper to read.
   */
  auto_credited: number
  /**
   * Autoclicker accumulation start ms (0 = not currently accumulating).
   * Lets the frontend render an "elapsed since accumulation started"
   * counter without tracking idle ticks itself.
   */
  auto_clicker_started_at_ms: number
  /**
   * Max idle accumulation seconds for the player's owned tier (0 if
   * autoclicker not unlocked). Equal to clicker_auto_clicker_levels.
   * duration_sec for the equipped row.
   */
  auto_clicker_max_idle_sec: number
  /** Pending click count waiting to be claimed. */
  auto_clicker_pending_count: number
  /** Pending point value waiting to be claimed. */
  auto_clicker_pending_value: number
  active_boost_key: string | null
  active_boost_expires_at_ms: number
}

interface BootstrapLoader {
  /** Loads (or lazily creates) the PG row needed to seed Redis. */
  findOrCreateByUserId(userId: number): Promise<ClickerUser>
}

/**
 * Clicker engine — the click hot path + state queries.
 *
 * Owns the Lua-driven loop:
 *   - `handleClickBatch` validates + clamps the requested count and
 *     dispatches to Redis,
 *   - `getCurrentState` runs the same Lua with count=0 to refresh
 *     server-anchored state without mutating points,
 *   - `runWithBootstrap` handles the `meta_missing` retry contract
 *     (bootstrap + retry once),
 *   - `deductPoints` is the spend path used by sibling modules
 *     (case opens, boost buys).
 *
 * Bootstrap from PG is delegated through `BootstrapLoader` so this
 * service stays unaware of the lazy-creation logic — that lives in
 * ClickerUserService where the user-facing entity lifecycle belongs.
 */
@Injectable()
export class ClickerEngineService {
  private readonly logger = new Logger(ClickerEngineService.name)
  private bootstrapLoader: BootstrapLoader | null = null

  /**
   * Per-user dedup of in-flight level-up handlers. When a player crosses
   * a threshold mid-batch, the very next clicks all see `level_up_due`
   * and would each independently trigger flush + meta refresh —
   * stacking three concurrent flushes that read different `total_points`
   * snapshots and race to overwrite Redis with stale state. Coalescing
   * onto a single Promise per user means the second/third concurrent
   * caller awaits the same handler and skips the duplicate work.
   *
   * Cleared in the finally block so a thrown handler doesn't permanently
   * blacklist the user.
   */
  private readonly levelUpInFlight = new Map<number, Promise<void>>()

  constructor(
    private readonly redisService: ClickerRedisService,
    private readonly flushService: ClickerFlushService,
    private readonly levelsCache: ClickerLevelsCacheService,
    private readonly metrics: ClickerMetricsService,
    private readonly historyService: ClickerHistoryService,
  ) {}

  /**
   * Wired by ClickerUserService at module init. Avoids a circular
   * Nest dependency (ClickerUserService → ClickerEngineService →
   * ClickerUserService) — the engine just needs a way to resolve a PG
   * row when bootstrap fires; everything else lives in Redis.
   */
  setBootstrapLoader(loader: BootstrapLoader): void {
    this.bootstrapLoader = loader
  }

  async handleClickBatch(
    userId: number,
    requestedCount: number,
    nowMs: number = Date.now(),
  ): Promise<ClickResult> {
    if (!Number.isFinite(requestedCount) || requestedCount <= 0) {
      throw new BadRequestException('count must be a positive number')
    }
    const count = Math.min(
      MAX_BATCH_PER_REQUEST,
      Math.floor(requestedCount),
    )
    clickerLog('engine.click', {
      user: userId,
      requested: requestedCount,
      clamped: count,
      now_ms: nowMs,
    })
    return this.runWithBootstrap(userId, count, nowMs)
  }

  async getCurrentState(
    userId: number,
    nowMs: number = Date.now(),
  ): Promise<ClickResult> {
    clickerLog('engine.status', { user: userId, now_ms: nowMs })
    return this.runWithBootstrap(userId, 0, nowMs)
  }

  /**
   * Atomic points debit for clicker side-spends (case opens, boost
   * purchases). Bootstraps Redis state if cold, then runs the deduct
   * Lua. Returns the user's new spendable balance.
   */
  async deductPoints(userId: number, amount: number): Promise<number> {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('amount must be a positive number')
    }
    const cost = Math.floor(amount)
    clickerLog('engine.deduct', {
      user: userId,
      requested: amount,
      cost,
      op: 'enter',
    })

    // Ensure state is loaded — runWithBootstrap with count=0 is a no-op
    // in the happy path, and lazy-loads from Postgres on cold cache.
    await this.runWithBootstrap(userId, 0, Date.now())

    const newBalance = await this.redisService.deductPoints(userId, cost)
    if (newBalance === -2) {
      // Bootstrap raced with a TTL eviction — reload and retry once.
      clickerLog('engine.deduct', {
        user: userId,
        op: 'meta-missing-retry',
        cost,
      })
      await this.bootstrapFromDb(userId)
      const retry = await this.redisService.deductPoints(userId, cost)
      if (retry < 0) {
        clickerLog('engine.deduct', {
          user: userId,
          op: 'insufficient-after-retry',
          balance: retry,
          cost,
        })
        throw new BadRequestException('Not enough carrots')
      }
      await this.persistAfterDebit(userId)
      this.metrics.record({ kind: 'spend', cost })
      clickerLog('engine.deduct', {
        user: userId,
        op: 'success-after-retry',
        new_balance: retry,
        cost,
      })
      return retry
    }
    if (newBalance < 0) {
      clickerLog('engine.deduct', {
        user: userId,
        op: 'insufficient',
        balance: newBalance,
        cost,
      })
      throw new BadRequestException('Not enough carrots')
    }
    await this.persistAfterDebit(userId)
    this.metrics.record({ kind: 'spend', cost })
    clickerLog('engine.deduct', {
      user: userId,
      op: 'success',
      new_balance: newBalance,
      cost,
    })
    return newBalance
  }

  /**
   * Hydrate Redis from Postgres for one user. Public so sibling
   * services (skill upgrades, grant points) can refresh meta after
   * mutating the PG row.
   */
  async bootstrapFromDb(userId: number): Promise<void> {
    if (!this.bootstrapLoader) {
      throw new Error(
        'ClickerEngineService.bootstrapLoader not set — wire ClickerUserService.setBootstrapLoader at module init',
      )
    }
    const user = await this.bootstrapLoader.findOrCreateByUserId(userId)
    if (!user.click_level || !user.energy_level) {
      throw new NotFoundException('Clicker profile is missing level config')
    }

    const lastTs = user.last_energy_update
      ? user.last_energy_update.getTime()
      : Date.now()

    const nextLevelCost = await this.findNextLevelCost(user.level?.id ?? 0)

    const critChancePct = user.crit_click_level?.crit_chance_pct ?? 0
    const autoClickerMaxIdleSec = user.auto_clicker_level?.duration_sec ?? 0

    clickerLogBlock(
      'engine.bootstrap',
      { user: userId, op: 'pg-load' },
      [
        [
          'pg-state',
          {
            points: user.points,
            total_points: user.total_points ?? 0,
            energy: user.energy_amount,
            last_energy_update_ms: lastTs,
            apc: user.auto_clicker_pending_count ?? 0,
            apv: user.auto_clicker_pending_value ?? 0,
          },
        ],
        [
          'pg-meta',
          {
            level_id: user.level?.id ?? 0,
            click_level_id: user.click_level.id,
            energy_level_id: user.energy_level.id,
            reward_per_click: user.click_level.reward_per_click,
            max_energy: user.energy_level.energy_amount,
            regen_per_sec_milli: user.energy_level.regen_per_sec_milli ?? 0,
            next_level_cost: nextLevelCost,
            crit_chance_pct: critChancePct,
            auto_clicker_max_idle_sec_db: autoClickerMaxIdleSec,
            auto_clicker_level_id: user.auto_clicker_level?.id ?? 0,
          },
        ],
      ],
    )

    await this.redisService.bootstrap(
      userId,
      {
        points: user.points,
        total_points: Math.max(user.total_points ?? 0, user.points ?? 0),
        energy: user.energy_amount,
        ts: lastTs,
        auto_clicker_pending_count: user.auto_clicker_pending_count ?? 0,
        auto_clicker_pending_value: user.auto_clicker_pending_value ?? 0,
      },
      {
        cost: user.click_level.reward_per_click,
        max_energy: user.energy_level.energy_amount,
        level_id: user.level?.id ?? 0,
        click_level_id: user.click_level.id,
        energy_level_id: user.energy_level.id,
        next_level_cost: nextLevelCost,
        crit_chance_pct: critChancePct,
        auto_clicker_max_idle_sec: autoClickerMaxIdleSec,
        // Per-level regen — 0 here lets clicker-redis.service.ts fall
        // back to the global env override for legacy rows that
        // haven't been backfilled yet by the per-level migration.
        regen_per_sec_milli: user.energy_level.regen_per_sec_milli ?? 0,
      },
    )

    const recoveredBoost =
      await this.historyService.findLatestUnexpiredActiveBoost(userId, Date.now())
    if (recoveredBoost) {
      await this.redisService.restoreActiveBoost(userId, recoveredBoost)
    }
  }

  /**
   * Coalesced level-up handler. Public so siblings (the claim flow)
   * can hand off into the same lock when claim's `level_up_due` signal
   * fires. Idempotent for the duration of the in-flight Promise — every
   * concurrent caller awaits the same handler instead of stacking
   * duplicate flushes.
   *
   * What it does: drain Redis state into PG (which also runs
   * maybeBumpLevels and writes the new level_id + next_level_cost
   * directly into Redis via updateLevelMeta — no clearMeta tear). After
   * this returns, Redis meta reflects the post-promotion bunny rank.
   */
  async runLevelUp(userId: number): Promise<void> {
    const existing = this.levelUpInFlight.get(userId)
    if (existing) {
      clickerLog('engine.levelup', { user: userId, op: 'coalesced' })
      await existing
      return
    }
    const promise = (async () => {
      try {
        await this.flushService.flushUser(userId)
        clickerLog('engine.levelup', { user: userId, op: 'flushed' })
      } finally {
        this.levelUpInFlight.delete(userId)
      }
    })()
    this.levelUpInFlight.set(userId, promise)
    await promise
  }

  // ---- Internals ---------------------------------------------------------

  private async runWithBootstrap(
    userId: number,
    count: number,
    nowMs: number,
  ): Promise<ClickResult> {
    clickerLog('engine.run', { user: userId, count, now_ms: nowMs, op: 'enter' })

    let result = await this.redisService.runClick(userId, count, nowMs)
    if (result.meta_missing) {
      clickerLog('engine.run', { user: userId, op: 'meta-missing-bootstrap' })
      await this.bootstrapFromDb(userId)
      result = await this.redisService.runClick(userId, count, nowMs)
      if (result.meta_missing) {
        clickerLog('engine.run', {
          user: userId,
          op: 'meta-missing-after-bootstrap',
        })
        throw new NotFoundException('Clicker profile not found')
      }
    }

    if (result.level_up_due) {
      const acceptedFromBatch = result.accepted
      clickerLog('engine.levelup', {
        user: userId,
        op: 'detected',
        accepted_in_batch: acceptedFromBatch,
        points: result.points,
        old_level_id: result.level_id,
      })
      await this.runLevelUp(userId)
      const fresh = await this.redisService.runClick(userId, 0, nowMs)
      result = { ...fresh, accepted: acceptedFromBatch }
      clickerLog('engine.levelup', {
        user: userId,
        op: 'rerun-done',
        new_level_id: fresh.level_id,
        points: fresh.points,
        max_energy: fresh.max_energy,
        cost: fresh.cost,
      })
    }

    // Fire-and-forget metrics — only when the call actually moved
    // anything player-visible. Skipping on "idle status check" calls
    // (count=0, no autoclicker tick) keeps the lua_calls counter
    // proportional to actual game traffic, not background polling.
    if (result.accepted > 0 || result.auto_credited > 0) {
      this.metrics.record({
        kind: 'click',
        accepted: result.accepted,
        auto_credited: result.auto_credited,
        crit_count: result.crit_count,
        level_up: result.level_up_due,
      })
    }

    clickerLog('engine.run', {
      user: userId,
      op: 'exit',
      accepted: result.accepted,
      points: result.points,
      total_points: result.total_points,
      energy: result.energy,
      max_energy: result.max_energy,
      cost: result.cost,
      regen_milli: result.regen_milli,
      auto_credited: result.auto_credited,
      crit_count: result.crit_count,
      apc: result.auto_clicker_pending_count,
      apv: result.auto_clicker_pending_value,
      active_boost_key: result.active_boost_key,
      active_boost_expires_at_ms: result.active_boost_expires_at_ms,
      ac_started_at_ms: result.auto_clicker_started_at_ms,
      ac_max_idle_sec: result.auto_clicker_max_idle_sec,
    })

    return {
      accepted: result.accepted,
      points: result.points,
      total_points: result.total_points,
      energy: result.energy,
      max_energy: result.max_energy,
      cost: result.cost,
      regen_per_sec: result.regen_milli > 0 ? result.regen_milli / 1000 : 0,
      level_id: result.level_id || null,
      click_level_id: result.click_level_id || null,
      energy_level_id: result.energy_level_id || null,
      crit_count: result.crit_count,
      auto_credited: result.auto_credited,
      auto_clicker_started_at_ms: result.auto_clicker_started_at_ms,
      auto_clicker_max_idle_sec: result.auto_clicker_max_idle_sec,
      auto_clicker_pending_count: result.auto_clicker_pending_count,
      auto_clicker_pending_value: result.auto_clicker_pending_value,
      active_boost_key: result.active_boost_key,
      active_boost_expires_at_ms: result.active_boost_expires_at_ms,
    }
  }

  private async findNextLevelCost(currentLevelId: number): Promise<number> {
    if (currentLevelId <= 0) return 0
    const next = await this.levelsCache.findNextBunnyLevel(currentLevelId)
    return next?.points_required ?? 0
  }

  private async persistAfterDebit(userId: number): Promise<void> {
    try {
      await this.flushService.flushUser(userId)
    } catch (err) {
      this.logger.warn(
        `flush-after-debit failed for user ${userId}: ${
          err instanceof Error ? err.message : err
        }`,
      )
    }
  }
}
