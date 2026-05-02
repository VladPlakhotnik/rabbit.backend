import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { ClickerUser } from './entities/clicker_user.entity'
import { ClickerLevelsService } from '../clickerLevels/clicker-levels.service'
import { CreateClickerUserDto } from './dto/create-clicker-user.dto'
import { ClickerClickLevelsService } from '../clickerClickLevels/clicker-click-levels.service'
import { ClickerEnergyLevelsService } from '../clickerEnergyLevels/clicker-energy-levels.service'
import { ClickerAutoClickerLevel } from '../clickerAutoClickerLevels/entities/clicker_auto_clicker_level.entity'
import { ClickerCritClickLevel } from '../clickerCritClickLevels/entities/clicker_crit_click_level.entity'
import { ClickerHistoryService } from '../clickerHistory/clicker-history.service'
import { ClickerRedisService } from './redis/clicker-redis.service'
import { ClickerFlushService } from './redis/clicker-flush.service'

/** Skill identifiers shared with the frontend / audit log. */
export type SkillKind = 'auto_clicker' | 'crit_click'

// Hard cap on a single batched click message. The frontend coalesces ~150 ms
// of clicks into one event, so even an autoclicker hitting 30 cps lands well
// under this. Anything larger is malformed/abusive and we drop the excess.
const MAX_BATCH_PER_REQUEST = 200

export interface ClickResult {
  accepted: number
  points: number
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
   * Seconds the auto-clicker collected this tick (folded into points
   * already; surfaced for the client so it can flash the balance / play
   * a "ghost click" animation when non-zero).
   */
  auto_clicks: number
}

@Injectable()
export class ClickerUserService {
  private readonly logger = new Logger(ClickerUserService.name)

  constructor(
    @InjectRepository(ClickerUser)
    private readonly clickerUserRepository: Repository<ClickerUser>,
    private readonly clickerLevelsService: ClickerLevelsService,
    private readonly clickerClickLevelsService: ClickerClickLevelsService,
    private readonly clickerEnergyLevelsService: ClickerEnergyLevelsService,
    private readonly redisService: ClickerRedisService,
    private readonly flushService: ClickerFlushService,
    private readonly historyService: ClickerHistoryService,
    private readonly dataSource: DataSource,
  ) {}

  findAll() {
    return this.clickerUserRepository.find()
  }

  findById(id: number) {
    return this.clickerUserRepository.findOne({ where: { id } })
  }

  async findByUserId(userId: number) {
    const user = await this.clickerUserRepository.findOne({
      where: { user_id: userId },
      relations: ['level', 'click_level', 'energy_level', 'auto_clicker_level', 'crit_click_level'],
    })
    if (!user) {
      throw new NotFoundException('Clicker profile not found')
    }
    return user
  }

  /**
   * Lazy-creation entry point. The clicker profile used to be created
   * eagerly during user registration, which gave every new player —
   * including ones who never touch the clicker tab — a row in
   * `clicker_users`, plus a redundant entry in the `dirty` set the very
   * first time anything looked them up. Now we materialise the profile
   * only at the moment a player actually needs one (REST `/me` or the
   * first click bootstrap), which keeps the table proportional to
   * actual engagement.
   *
   * Concurrency note: if two requests for the same user race here, both
   * `findOne`s miss and both call `create`. The DB-level UNIQUE constraint
   * (or the explicit conflict check inside `create`) on
   * `clicker_users.user_id` guarantees only one row sticks; we catch the
   * race and re-read the existing row.
   */
  async findOrCreateByUserId(userId: number) {
    const existing = await this.clickerUserRepository.findOne({
      where: { user_id: userId },
      relations: ['level', 'click_level', 'energy_level', 'auto_clicker_level', 'crit_click_level'],
    })
    if (existing) return existing

    try {
      await this.create({
        user_id: userId,
        level: 1,
        click_level: 1,
        energy_level: 1,
      } as CreateClickerUserDto)
    } catch (err) {
      if (!(err instanceof ConflictException)) throw err
      // Lost the race — another request already created the row.
    }

    const created = await this.clickerUserRepository.findOne({
      where: { user_id: userId },
      relations: ['level', 'click_level', 'energy_level', 'auto_clicker_level', 'crit_click_level'],
    })
    if (!created) {
      // create() validated and saved; if findOne now misses, the DB
      // dropped it (replication lag, manual intervention, ...). Bail
      // loudly rather than handing back a phantom.
      throw new NotFoundException('Clicker profile creation succeeded but read missed')
    }
    return created
  }

  async create(createDto: CreateClickerUserDto) {
    const existingUser = await this.clickerUserRepository.findOne({
      where: { user_id: createDto.user_id },
    })
    if (existingUser) {
      throw new ConflictException(
        'Clicker profile already exists for this user',
      )
    }

    const level = await this.clickerLevelsService.findById(createDto.level || 1)
    if (!level) throw new NotFoundException('Initial level not found')
    const clickLevel = await this.clickerClickLevelsService.findById(
      createDto.click_level || 1,
    )
    if (!clickLevel) {
      throw new NotFoundException('Initial click level not found')
    }
    const energyLevel = await this.clickerEnergyLevelsService.findById(
      createDto.energy_level || 1,
    )
    if (!energyLevel) {
      throw new NotFoundException('Initial energy level not found')
    }

    const clickerUser = this.clickerUserRepository.create({
      user_id: createDto.user_id,
      level,
      click_level: clickLevel,
      energy_level: energyLevel,
      energy_amount: createDto.energy_amount ?? energyLevel.energy_amount,
      points: createDto.points ?? 0,
      last_energy_update: new Date(),
    })
    return this.clickerUserRepository.save(clickerUser)
  }

  update(id: number, data: Partial<ClickerUser>) {
    return this.clickerUserRepository.update(id, data)
  }

  remove(id: number) {
    return this.clickerUserRepository.delete(id)
  }

  /**
   * Apply a batch of clicks atomically. The actual energy/points math runs
   * inside a Redis Lua script — this method just orchestrates the lazy-load
   * (first click after a cold cache loads the user from Postgres) and clamps
   * the requested count.
   */
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
    return this.runWithBootstrap(userId, count, nowMs)
  }

  /**
   * Read the current state without mutating it. Same Lua path with count=0
   * computes regenerated energy and lazy-loads if needed.
   */
  async getCurrentState(
    userId: number,
    nowMs: number = Date.now(),
  ): Promise<ClickResult> {
    return this.runWithBootstrap(userId, 0, nowMs)
  }

  private async runWithBootstrap(
    userId: number,
    count: number,
    nowMs: number,
  ): Promise<ClickResult> {
    let result = await this.redisService.runClick(userId, count, nowMs)
    if (result.meta_missing) {
      await this.bootstrapFromDb(userId)
      result = await this.redisService.runClick(userId, count, nowMs)
      if (result.meta_missing) {
        // bootstrap should have written meta; getting here means the row
        // was deleted between the two calls or Redis dropped it.
        throw new NotFoundException('Clicker profile not found')
      }
    }

    // Bunny crossed the next level threshold — apply the level-up now (rather
    // than waiting for the cron flush) so the player sees it immediately.
    if (result.level_up_due) {
      const acceptedFromBatch = result.accepted
      // Persists current state and bumps level inside maybeBumpLevels.
      await this.flushService.flushUser(userId)
      // Refresh meta so Lua sees the new level_id / next_level_cost. Do NOT
      // clear state — we just persisted it and want to keep accumulating.
      await this.redisService.clearMeta(userId)
      await this.bootstrapFromDb(userId)
      // Re-read state with count=0 to grab the post-bump level_id without
      // double-counting clicks.
      const fresh = await this.redisService.runClick(userId, 0, nowMs)
      result = { ...fresh, accepted: acceptedFromBatch }
    }

    return {
      accepted: result.accepted,
      points: result.points,
      energy: result.energy,
      max_energy: result.max_energy,
      cost: result.cost,
      regen_per_sec: result.regen_milli > 0 ? result.regen_milli / 1000 : 0,
      level_id: result.level_id || null,
      click_level_id: result.click_level_id || null,
      energy_level_id: result.energy_level_id || null,
      crit_count: result.crit_count,
      auto_clicks: result.auto_clicks,
    }
  }

  /**
   * Hydrate Redis from Postgres for one user. Idempotent — runs SETNX for
   * state so a parallel handler that already loaded won't be clobbered.
   *
   * Materialises the Postgres row on first touch via findOrCreateByUserId,
   * so a click coming in before the player ever hit GET /clicker-users/me
   * still bootstraps cleanly instead of 404-ing.
   */
  private async bootstrapFromDb(userId: number): Promise<void> {
    const user = await this.findOrCreateByUserId(userId)
    if (!user.click_level || !user.energy_level) {
      // Defensive: the schema lets these be null in TypeORM relations; in
      // practice every active row should have both, but bail loudly if not.
      throw new NotFoundException('Clicker profile is missing level config')
    }

    const lastTs = user.last_energy_update
      ? user.last_energy_update.getTime()
      : Date.now()

    const nextLevelCost = await this.findNextLevelCost(user.level?.id ?? 0)

    // Crit chance defaults to 0 when the skill isn't unlocked — the Lua
    // hot path checks `cc > 0` before entering the roll loop, so an
    // unupgraded user pays no extra cost per click.
    const critChancePct = user.crit_click_level?.crit_chance_pct ?? 0

    await this.redisService.bootstrap(
      userId,
      {
        points: user.points,
        energy: user.energy_amount,
        ts: lastTs,
      },
      {
        cost: user.click_level.reward_per_click,
        max_energy: user.energy_level.energy_amount,
        level_id: user.level?.id ?? 0,
        click_level_id: user.click_level.id,
        energy_level_id: user.energy_level.id,
        next_level_cost: nextLevelCost,
        crit_chance_pct: critChancePct,
      },
    )
  }

  /** Returns 0 when the user is at max level (no more upgrades). */
  private async findNextLevelCost(currentLevelId: number): Promise<number> {
    if (currentLevelId <= 0) return 0
    const next = await this.clickerLevelsService.findById(currentLevelId + 1)
    return next?.points_required ?? 0
  }

  /**
   * Atomic points debit for clicker side-spends (case opens, future shop
   * items). Bootstraps Redis state if cold, then runs the deduct Lua script.
   * Returns the user's new balance.
   *
   * Throws BadRequestException if balance is insufficient. The next cron
   * flush picks up the new value and writes it to Postgres — the caller
   * does NOT need to flush manually.
   */
  async deductPoints(userId: number, amount: number): Promise<number> {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('amount must be a positive number')
    }
    const cost = Math.floor(amount)

    // Ensure state is loaded — runWithBootstrap with count=0 is a no-op
    // in the happy path, and lazy-loads from Postgres on cold cache.
    await this.runWithBootstrap(userId, 0, Date.now())

    const newBalance = await this.redisService.deductPoints(userId, cost)
    if (newBalance === -2) {
      // Bootstrap raced with a TTL eviction — reload and retry once.
      await this.bootstrapFromDb(userId)
      const retry = await this.redisService.deductPoints(userId, cost)
      if (retry < 0) {
        throw new BadRequestException('Not enough carrots')
      }
      await this.persistAfterDebit(userId)
      return retry
    }
    if (newBalance < 0) {
      throw new BadRequestException('Not enough carrots')
    }
    await this.persistAfterDebit(userId)
    return newBalance
  }

  /**
   * Best-effort sync of the deducted balance into Postgres so the very next
   * REST query (e.g. `/clicker-users/me` after returning to the clicker
   * page) reflects the spend without waiting up to a minute for the cron
   * flush. A failure here is not fatal — the cron will catch up — so we
   * swallow the error to keep the open-case flow on the happy path.
   */
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

  async upgradeClickLevel(userId: number) {
    // Pull anything Redis-side into Postgres first so we read the actual
    // current points below, not whatever stale value last got flushed.
    await this.flushService.flushUser(userId)

    const user = await this.clickerUserRepository.findOne({
      where: { user_id: userId },
      relations: ['click_level'],
    })
    if (!user) throw new NotFoundException('User not found')

    const nextClickLevel = await this.clickerClickLevelsService.findById(
      user.click_level.id + 1,
    )
    if (!nextClickLevel) {
      throw new NotFoundException('Next click level not found')
    }
    if (user.points < nextClickLevel.upgrade_cost) {
      throw new BadRequestException('Not enough points for upgrade')
    }

    user.click_level = nextClickLevel
    user.points -= nextClickLevel.upgrade_cost
    await this.clickerUserRepository.save(user)

    // Drop Redis state. Next click lazy-loads with the new click_level / cost.
    await this.redisService.clearUser(userId)

    return {
      click_level: user.click_level,
      points: user.points,
    }
  }

  async upgradeEnergyLevel(userId: number) {
    await this.flushService.flushUser(userId)

    const user = await this.clickerUserRepository.findOne({
      where: { user_id: userId },
      relations: ['energy_level'],
    })
    if (!user) throw new NotFoundException('User not found')

    const nextEnergyLevel = await this.clickerEnergyLevelsService.findById(
      user.energy_level.id + 1,
    )
    if (!nextEnergyLevel) {
      throw new NotFoundException('Next energy level not found')
    }
    if (user.points < nextEnergyLevel.upgrade_cost) {
      throw new BadRequestException('Not enough points for upgrade')
    }

    user.energy_level = nextEnergyLevel
    user.points -= nextEnergyLevel.upgrade_cost
    await this.clickerUserRepository.save(user)

    await this.redisService.clearUser(userId)

    return {
      energy_level: user.energy_level,
      energy_amount: user.energy_amount,
      points: user.points,
    }
  }

  /**
   * Upgrade a "skill" track (auto-clicker or crit-click) one tier up.
   *
   * Differences from the click / energy upgrade methods above:
   *
   *   1. **Pessimistic write lock** on `clicker_users` for the duration
   *      of the upgrade. Two concurrent calls (double-tap, two tabs)
   *      otherwise both pass the affordability check, both write the
   *      same `level_id`, and the player gets one tier for the price
   *      of two. SELECT FOR UPDATE serialises them — the second waits,
   *      then sees the post-upgrade state and either bumps further
   *      (legitimate) or fails affordability (correct rejection).
   *
   *   2. **Skill-not-unlocked path**. Both relations are nullable —
   *      `NULL = never bought`. The first upgrade promotes from NULL
   *      directly to level 1 (purchasing the skill); subsequent
   *      upgrades step through 1 → 2 → 3 → … . There is no separate
   *      "buy" step on the API — purchase = first upgrade.
   *
   *   3. **Audit log** entry on success. Captures the carrot debit
   *      and the level transition so the admin / forensics tools can
   *      reconstruct the player's progression.
   *
   * Bypasses Redis on purpose — skill upgrades are rare (a few per
   * session, max), so the simpler PG-as-truth path beats juggling
   * Redis state for marginal latency.
   */
  private async upgradeSkill<
    TLevel extends { id: number; level: number; upgrade_cost: number },
  >(
    userId: number,
    skillKind: SkillKind,
    levelEntity: { new (): TLevel } & Function,
    relationKey: 'auto_clicker_level' | 'crit_click_level',
    extraStateForLog?: (level: TLevel) => Record<string, unknown>,
    ip?: string | null,
  ): Promise<{ level: TLevel; points: number }> {
    // Drain Redis → PG so the points figure we lock against below is
    // the freshest available. Without this we'd lock on a value that's
    // already drifted from authoritative state.
    await this.flushService.flushUser(userId)

    const result = await this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(ClickerUser, {
        where: { user_id: userId },
        relations: [relationKey],
        lock: { mode: 'pessimistic_write' },
      })
      if (!user) {
        throw new NotFoundException('Clicker profile not found')
      }

      const currentLevel = user[relationKey] as TLevel | null
      const nextLevelId = (currentLevel?.id ?? 0) + 1
      const nextLevel = await manager.findOne(levelEntity, {
        where: { id: nextLevelId } as never,
      })
      if (!nextLevel) {
        // Already at max tier — surfaced as 400 since the action is
        // semantically refused, not "level missing".
        throw new BadRequestException('Already at the maximum tier')
      }

      if (user.points < nextLevel.upgrade_cost) {
        throw new BadRequestException('Not enough points for upgrade')
      }

      const stateBefore = {
        points: user.points,
        level_id: currentLevel?.id ?? null,
      }

      // Mutate inside the transaction so the lock holds until COMMIT.
      ;(user as unknown as Record<string, TLevel>)[relationKey] = nextLevel
      user.points -= nextLevel.upgrade_cost
      await manager.save(user)

      return {
        level: nextLevel,
        points: user.points,
        stateBefore,
        stateAfter: {
          points: user.points,
          level_id: nextLevel.id,
          ...(extraStateForLog ? extraStateForLog(nextLevel) : {}),
        },
      }
    })

    // Drop Redis state so the next click lazy-loads with the new
    // skill level baked into bootstrap. Outside the transaction —
    // transaction holds DB row, Redis is independent.
    await this.redisService.clearUser(userId)

    // Audit log — best-effort. Insert errors logged + swallowed inside
    // the service (see ClickerHistoryService).
    await this.historyService.record({
      user_id: userId,
      action: 'upgrade_skill',
      payload: { skill: skillKind, cost: result.level.upgrade_cost },
      state_before: result.stateBefore,
      state_after: result.stateAfter,
      source: 'ws',
      ip: ip ?? null,
    })

    return { level: result.level, points: result.points }
  }

  async upgradeAutoClickerLevel(
    userId: number,
    ip?: string | null,
  ): Promise<{ auto_clicker_level: ClickerAutoClickerLevel; points: number }> {
    const { level, points } = await this.upgradeSkill<ClickerAutoClickerLevel>(
      userId,
      'auto_clicker',
      ClickerAutoClickerLevel,
      'auto_clicker_level',
      (lvl) => ({ duration_sec: lvl.duration_sec }),
      ip,
    )
    return { auto_clicker_level: level, points }
  }

  async upgradeCritClickLevel(
    userId: number,
    ip?: string | null,
  ): Promise<{ crit_click_level: ClickerCritClickLevel; points: number }> {
    const { level, points } = await this.upgradeSkill<ClickerCritClickLevel>(
      userId,
      'crit_click',
      ClickerCritClickLevel,
      'crit_click_level',
      (lvl) => ({ crit_chance_pct: lvl.crit_chance_pct }),
      ip,
    )
    return { crit_click_level: level, points }
  }

  /**
   * Kick off the auto-clicker for `duration_sec` seconds (read off the
   * player's currently-owned tier — never from client input).
   *
   * Path:
   *   1. Validate the skill is unlocked (auto_clicker_level_id != null).
   *   2. Ensure Redis state is loaded (runWithBootstrap with count=0 is
   *      a cheap no-op when warm).
   *   3. Atomic activate inside Lua — re-checks the deadline so two
   *      concurrent `activate` calls can't both land.
   *   4. Audit log the activation.
   *
   * Returns the activation deadline (ms) for the client countdown.
   */
  /**
   * Admin-only: bump or remove a user's carrots and re-anchor their
   * bunny level to whatever points threshold the new balance hits.
   *
   * Why not just `UPDATE clicker_users SET points = ...`:
   *   1. Redis is the source of truth during a session — without
   *      clearing the user's Redis hash a manual UPDATE gets
   *      overwritten by the next cron flush.
   *   2. After a manual points bump the bunny level should re-anchor:
   *      if the player crosses a points threshold, level should bump
   *      up. (We never DOWNgrade — level is monotonic by design.)
   *   3. Audit trail — every admin grant lands one row in
   *      clicker_history with payload {amount, reason} and a clear
   *      `source = 'admin'` so it stands out in queries.
   *
   * Steps:
   *   1. Flush Redis → PG so we lock against the freshest balance.
   *   2. Pessimistic-write transaction:
   *      - SELECT FOR UPDATE on clicker_users
   *      - new_points = max(0, current + delta)
   *      - new_level = highest level whose points_required ≤ new_points,
   *        but never below the current level (monotonic guard)
   *      - UPDATE points + level + last_energy_update
   *   3. clearUser in Redis — next click bootstraps with the new
   *      values straight from PG.
   *   4. History row.
   *
   * @param adminUserId who issued the grant — for audit forensics
   * @param targetUserId whose carrots are being modified
   * @param delta positive = grant, negative = remove. Floats are
   *              rejected (DTO clamps to integer).
   * @param reason optional free-text annotation in the audit row
   */
  async adminGrantPoints(
    adminUserId: number,
    targetUserId: number,
    delta: number,
    reason: string | null,
    ip?: string | null,
  ): Promise<{
    user_id: number
    points: number
    level_id: number
  }> {
    if (!Number.isFinite(delta) || delta === 0) {
      throw new BadRequestException('delta must be a non-zero finite number')
    }
    const intDelta = Math.trunc(delta)

    // Step 1: drain Redis state into PG so the lock catches the
    // freshest figure, not a 60-second-stale one.
    await this.flushService.flushUser(targetUserId)

    const result = await this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(ClickerUser, {
        where: { user_id: targetUserId },
        relations: ['level'],
        lock: { mode: 'pessimistic_write' },
      })
      if (!user) {
        throw new NotFoundException('Clicker profile not found')
      }

      const stateBefore = {
        points: user.points,
        level_id: user.level?.id ?? null,
      }

      // Floor at 0 — admin can't drag a balance into negative
      // territory; if delta would do so, we just zero it out.
      const newPoints = Math.max(0, user.points + intDelta)

      // Re-anchor the level. Pull the catalog (cheap — < 20 rows) and
      // pick the highest tier whose points_required <= newPoints.
      // Never drop below the current level — by design level is a
      // permanent rank, not a "do they still qualify" flag.
      const allLevels = await this.clickerLevelsService.findAll()
      const sorted = [...allLevels].sort((a, b) => a.id - b.id)
      const currentLevelId = user.level?.id ?? 0
      let nextLevel = user.level
      for (const lv of sorted) {
        if (lv.id < currentLevelId) continue
        if (newPoints >= lv.points_required) {
          nextLevel = lv
        } else {
          break
        }
      }

      user.points = newPoints
      if (nextLevel) {
        user.level = nextLevel
      }
      user.last_energy_update = new Date()
      await manager.save(user)

      return {
        stateBefore,
        stateAfter: {
          points: user.points,
          level_id: user.level?.id ?? null,
        },
        points: user.points,
        level_id: user.level?.id ?? 0,
      }
    })

    // Step 3: drop Redis cache. Next click sees meta_missing and
    // re-bootstraps with the new points / level / next_level_cost.
    await this.redisService.clearUser(targetUserId)

    // Step 4: audit log. Source 'admin' so we can grep these
    // separately from organic 'ws' / 'cron' history.
    await this.historyService.record({
      user_id: targetUserId,
      action: 'admin_grant_points',
      payload: {
        admin_user_id: adminUserId,
        delta: intDelta,
        reason: reason ?? null,
      },
      state_before: result.stateBefore,
      state_after: result.stateAfter,
      source: 'admin',
      ip: ip ?? null,
    })

    return {
      user_id: targetUserId,
      points: result.points,
      level_id: result.level_id,
    }
  }

  async activateAutoClicker(
    userId: number,
    ip?: string | null,
  ): Promise<{ expires_at_ms: number; duration_sec: number; level: number }> {
    const user = await this.findOrCreateByUserId(userId)
    if (!user.auto_clicker_level) {
      throw new BadRequestException('Auto-clicker not unlocked')
    }
    const duration = user.auto_clicker_level.duration_sec
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new BadRequestException('Auto-clicker tier has invalid duration')
    }

    const nowMs = Date.now()
    // No-op when state already loaded; bootstraps from Postgres on
    // cold cache so the activate Lua's meta-check never trips.
    await this.runWithBootstrap(userId, 0, nowMs)

    const result = await this.redisService.activateAutoClicker(
      userId,
      nowMs,
      duration,
    )
    if (result === -1) {
      // Bootstrap should have written meta — if Lua still says missing,
      // Redis dropped the row between the calls (TTL or eviction).
      throw new NotFoundException('Clicker state not loaded')
    }
    if (result === -2) {
      throw new BadRequestException('Auto-clicker already running')
    }

    await this.historyService.record({
      user_id: userId,
      action: 'auto_clicker_activate',
      payload: {
        level_id: user.auto_clicker_level.id,
        duration_sec: duration,
      },
      state_after: { expires_at_ms: result },
      source: 'ws',
      ip: ip ?? null,
    })

    return {
      expires_at_ms: result,
      duration_sec: duration,
      level: user.auto_clicker_level.level,
    }
  }
}
