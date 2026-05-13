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
import { OnModuleInit } from '@nestjs/common'
import { ClickerHistoryService } from '../clickerHistory/clicker-history.service'
import { ClickerRedisService } from './redis/clicker-redis.service'
import { ClickerFlushService } from './redis/clicker-flush.service'
import { ClickerLevelsCacheService } from './services/clicker-levels-cache.service'
import {
  ClickerEngineService,
  type ClickResult,
} from './services/clicker-engine.service'
import { ClickerMetricsService } from './services/clicker-metrics.service'

/** Skill identifiers shared with the frontend / audit log. */
export type SkillKind = 'auto_clicker' | 'crit_click'

// ClickResult re-exported from the engine service so existing
// importers (gateway, sibling services) keep their import paths.
export type { ClickResult }

/**
 * Result of an atomic autoclicker claim. `claimed_*` are the totals
 * just credited to the player; `points` is the post-claim balance.
 * On a no-op claim (apc was already 0) all three counts are 0 and the
 * call is a successful no-op rather than an error.
 */
export interface ClaimAutoClickerResult {
  claimed_count: number
  claimed_value: number
  points: number
  total_points: number
}

@Injectable()
export class ClickerUserService implements OnModuleInit {
  private readonly logger = new Logger(ClickerUserService.name)

  constructor(
    @InjectRepository(ClickerUser)
    private readonly clickerUserRepository: Repository<ClickerUser>,
    private readonly clickerLevelsService: ClickerLevelsService,
    private readonly clickerClickLevelsService: ClickerClickLevelsService,
    private readonly clickerEnergyLevelsService: ClickerEnergyLevelsService,
    private readonly redisService: ClickerRedisService,
    private readonly flushService: ClickerFlushService,
    private readonly levelsCache: ClickerLevelsCacheService,
    private readonly engineService: ClickerEngineService,
    private readonly metrics: ClickerMetricsService,
    private readonly historyService: ClickerHistoryService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Hand the engine a callback for resolving PG rows on bootstrap.
   * Avoids a circular Nest constructor injection (engine ↔ user
   * service); the engine just needs a way to lazy-create the
   * underlying row when its Lua hot path hits a cold cache.
   */
  onModuleInit(): void {
    this.engineService.setBootstrapLoader({
      findOrCreateByUserId: (userId: number) =>
        this.findOrCreateByUserId(userId),
    })
  }

  /**
   * Paginated admin listing. Caller passes `page` (1-based) and `limit`;
   * we cap `limit` at 100 in the DTO so a single request can't blow up
   * the response. Relations are loaded so the admin UI can render
   * `level.name`, `click_level.id`, etc. without a second round-trip.
   *
   * Returns `{ data, total, page, limit }` so the table can render
   * pagination controls without a separate `/count` endpoint.
   */
  async findAll(page = 1, limit = 20, search?: string) {
    const safePage = Math.max(1, Math.floor(page))
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)))
    const qb = this.clickerUserRepository
      .createQueryBuilder('clickerUser')
      .leftJoinAndSelect('clickerUser.level', 'level')
      .leftJoinAndSelect('clickerUser.click_level', 'clickLevel')
      .leftJoinAndSelect('clickerUser.energy_level', 'energyLevel')
      .leftJoinAndSelect('clickerUser.auto_clicker_level', 'autoClickerLevel')
      .leftJoinAndSelect('clickerUser.crit_click_level', 'critClickLevel')
      .orderBy('clickerUser.id', 'ASC')
      .skip((safePage - 1) * safeLimit)
      .take(safeLimit)

    const normalizedSearch = search?.trim()
    if (normalizedSearch) {
      qb.andWhere(
        `(${[
          'CAST(clickerUser.id AS TEXT) ILIKE :search',
          'CAST(clickerUser.user_id AS TEXT) ILIKE :search',
          'CAST(clickerUser.points AS TEXT) ILIKE :search',
          'CAST(clickerUser.total_points AS TEXT) ILIKE :search',
        ].join(' OR ')})`,
        { search: `%${normalizedSearch}%` },
      )
    }

    const [data, total] = await qb.getManyAndCount()
    return { data, total, page: safePage, limit: safeLimit }
  }

  findById(id: number) {
    return this.clickerUserRepository.findOne({
      where: { id },
      relations: [
        'level',
        'click_level',
        'energy_level',
        'auto_clicker_level',
        'crit_click_level',
      ],
    })
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

  // NOTE: `update(id, data)` and `remove(id)` were removed alongside
  // the `PUT` / `DELETE` admin endpoints. Mass-assignment via
  // `Body() data: any` was a write-anything-anywhere hole, and a
  // generic `DELETE` orphans FKs in `clicker_history`, boost rows,
  // case-open audit, etc. Targeted admin actions (set-balance,
  // set-level, soft-disable) belong in a future PR — see the
  // hand-off note at the bottom of clicker-user.controller.ts.

  // ─── Engine delegates ──────────────────────────────────────────────
  // The click hot path, state queries, and side-spend debit all live
  // in ClickerEngineService now. These thin wrappers preserve the
  // existing call-sites (gateway, ClickerBoostsService, ClickerCases,
  // etc.) so the split is a refactor, not a breaking change.

  handleClickBatch(
    userId: number,
    requestedCount: number,
    nowMs: number = Date.now(),
  ): Promise<ClickResult> {
    return this.engineService.handleClickBatch(userId, requestedCount, nowMs)
  }

  getCurrentState(
    userId: number,
    nowMs: number = Date.now(),
  ): Promise<ClickResult> {
    return this.engineService.getCurrentState(userId, nowMs)
  }

  deductPoints(userId: number, amount: number): Promise<number> {
    return this.engineService.deductPoints(userId, amount)
  }

  // ─── Skill / progression / admin grant ─────────────────────────────
  // Still lives in this service for the moment — split into
  // ClickerSkillsService / ClickerProgressionService is the next
  // refactor pass.

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
      // SELECT FOR UPDATE on clicker_users alone — no JOIN. TypeORM's
      // findOne(... lock + relations ...) emits a LEFT JOIN on the
      // relation table and Postgres refuses to lock the result of an
      // outer join ("FOR UPDATE cannot be applied to the nullable side
      // of an outer join"). Lock the row first, then load the relation
      // separately without a lock.
      const user = await manager
        .createQueryBuilder(ClickerUser, 'cu')
        .where('cu.user_id = :userId', { userId })
        .setLock('pessimistic_write')
        .getOne()
      if (!user) {
        throw new NotFoundException('Clicker profile not found')
      }

      // Cheap second query — the row is already locked, so this read
      // races nothing. Without `lock` TypeORM is happy to LEFT JOIN.
      const userWithRelation = await manager.findOne(ClickerUser, {
        where: { user_id: userId },
        relations: [relationKey],
      })
      const currentLevel =
        ((userWithRelation as unknown as Record<string, unknown>)[relationKey] ??
          null) as TLevel | null

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
   * Mutate a target user's carrots and re-anchor their bunny level to
   * whatever points threshold the new balance hits. Authorisation
   * (admin role) is enforced at the controller layer with RolesGuard;
   * this method just owns the data path and assumes the caller passed
   * the gate.
   *
   * Why not just `UPDATE clicker_users SET points = ...`:
   *   1. Redis is the source of truth during a session — without
   *      clearing the user's Redis hash a manual UPDATE gets
   *      overwritten by the next cron flush.
   *   2. After a points bump the bunny level should re-anchor: if the
   *      player crosses a points threshold, level should bump up.
   *      (We never DOWNgrade — level is monotonic by design.)
   *   3. Audit trail — every grant lands one row in clicker_history
   *      with payload {delta, reason, issuer_user_id} and source =
   *      'admin' so it's greppable separately from organic traffic.
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
   * @param issuerAdminId UUID of the admin from `admins` table — for
   *                      audit forensics. Used to be a player `users.id`
   *                      back when the legacy `Roles('admin')` guard ran
   *                      the show; now it's an admin-panel staff id
   *                      because authorisation moved to AdminJwtGuard.
   * @param targetUserId whose carrots are being modified
   * @param delta positive = grant, negative = remove. Floats are
   *              truncated (DTO clamps to integer).
   * @param reason optional free-text annotation in the audit row
   */
  async grantPoints(
    issuerAdminId: string,
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
      // Lock the clicker_users row first WITHOUT joining the level
      // relation — Postgres refuses FOR UPDATE on the nullable side
      // of a LEFT JOIN. Then load the level separately (no lock
      // needed; the row is already pinned).
      const user = await manager
        .createQueryBuilder(ClickerUser, 'cu')
        .where('cu.user_id = :targetUserId', { targetUserId })
        .setLock('pessimistic_write')
        .getOne()
      if (!user) {
        throw new NotFoundException('Clicker profile not found')
      }
      const userWithLevel = await manager.findOne(ClickerUser, {
        where: { user_id: targetUserId },
        relations: ['level'],
      })
      const currentLevel = userWithLevel?.level ?? null

      const stateBefore = {
        points: user.points,
        total_points: user.total_points,
        level_id: currentLevel?.id ?? null,
      }

      // Floor at 0 — admin can't drag a balance into negative
      // territory; if delta would do so, we just zero it out.
      const newPoints = Math.max(0, user.points + intDelta)

      // Lifetime tally only goes up — a negative grant (admin clawback)
      // hits `points` but doesn't roll back what the player has
      // already earned. Otherwise a clawback could trigger a level
      // demotion via the threshold check below, which we don't allow.
      const newTotalPoints =
        (user.total_points ?? 0) + Math.max(0, intDelta)

      // Re-anchor the level. Pull the catalog (cheap — < 20 rows) and
      // pick the highest tier whose points_required <= newTotalPoints.
      // Reading from the lifetime tally rather than the spendable
      // balance is the whole point of the column — without it a
      // post-spend grantPoints could "demote" by checking against a
      // depleted balance. The current-level floor still guards
      // monotonicity even in edge cases (e.g., admin-edited PG row).
      // Cache hit on a hot admin path — bunny levels rarely change so
      // a process-wide warm cache beats a fresh SELECT every grant.
      const sorted = await this.levelsCache.getBunnyLevels()
      const currentLevelId = currentLevel?.id ?? 0
      let nextLevel = currentLevel
      for (const lv of sorted) {
        if (lv.id < currentLevelId) continue
        if (newTotalPoints >= lv.points_required) {
          nextLevel = lv
        } else {
          break
        }
      }

      user.points = newPoints
      user.total_points = newTotalPoints
      if (nextLevel) {
        user.level = nextLevel
      }
      user.last_energy_update = new Date()
      await manager.save(user)

      return {
        stateBefore,
        stateAfter: {
          points: user.points,
          total_points: user.total_points,
          level_id: user.level?.id ?? null,
        },
        points: user.points,
        level_id: user.level?.id ?? 0,
      }
    })

    // Step 3: drop Redis cache. Next click sees meta_missing and
    // re-bootstraps with the new points / level / next_level_cost.
    await this.redisService.clearUser(targetUserId)

    // Audit log. Source 'admin' so manual grants are greppable
    // separately from organic 'ws' / 'cron' history.
    await this.historyService.record({
      user_id: targetUserId,
      action: 'grant_points',
      payload: {
        issuer_admin_id: issuerAdminId,
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

  async grantWheelRewardPoints(
    targetUserId: number,
    amount: number,
  ): Promise<{
    user_id: number
    points: number
    level_id: number
  }> {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('amount must be a positive finite number')
    }
    const intAmount = Math.trunc(amount)

    await this.findOrCreateByUserId(targetUserId)
    await this.flushService.flushUser(targetUserId)

    const result = await this.dataSource.transaction(async manager => {
      const user = await manager
        .createQueryBuilder(ClickerUser, 'cu')
        .where('cu.user_id = :targetUserId', { targetUserId })
        .setLock('pessimistic_write')
        .getOne()
      if (!user) {
        throw new NotFoundException('Clicker profile not found')
      }

      const userWithLevel = await manager.findOne(ClickerUser, {
        where: { user_id: targetUserId },
        relations: ['level'],
      })
      const currentLevel = userWithLevel?.level ?? null

      const stateBefore = {
        points: user.points,
        total_points: user.total_points,
        level_id: currentLevel?.id ?? null,
      }

      user.points += intAmount
      user.total_points = (user.total_points ?? 0) + intAmount

      const sorted = await this.levelsCache.getBunnyLevels()
      const currentLevelId = currentLevel?.id ?? 0
      let nextLevel = currentLevel
      for (const lv of sorted) {
        if (lv.id < currentLevelId) continue
        if (user.total_points >= lv.points_required) {
          nextLevel = lv
        } else {
          break
        }
      }

      if (nextLevel) {
        user.level = nextLevel
      }
      user.last_energy_update = new Date()
      await manager.save(user)

      return {
        stateBefore,
        stateAfter: {
          points: user.points,
          total_points: user.total_points,
          level_id: user.level?.id ?? null,
        },
        points: user.points,
        level_id: user.level?.id ?? 0,
      }
    })

    await this.redisService.clearUser(targetUserId)

    await this.historyService.record({
      user_id: targetUserId,
      action: 'bonus_wheel_reward',
      payload: { amount: intAmount, reward_type: 'CARROTS' },
      state_before: result.stateBefore,
      state_after: result.stateAfter,
      source: 'rest',
      ip: null,
    })

    return {
      user_id: targetUserId,
      points: result.points,
      level_id: result.level_id,
    }
  }

  /**
   * Claim the autoclicker pending bank. Atomic Redis Lua —
   * concurrent calls (double-tap, two tabs) get serialised and only
   * the first sees a non-zero apc; the second is a no-op.
   *
   * Bootstrap-then-retry on meta-missing matches the click hot path
   * (Redis evicted the user mid-call). After the claim Lua succeeds we
   * also persist the just-credited points to Postgres synchronously so
   * the open-this-page-on-another-device flow doesn't briefly show the
   * pre-claim balance.
   */
  async claimAutoClicker(
    userId: number,
    ip?: string | null,
  ): Promise<ClaimAutoClickerResult> {
    const nowMs = Date.now()

    // Ensure state is loaded — bootstraps from Postgres on cold cache,
    // bringing along apc/apv if they were flushed before eviction. The
    // engine owns runWithBootstrap; we go through its public wrapper.
    await this.engineService.getCurrentState(userId, nowMs)

    let result = await this.redisService.claimAutoClicker(userId, nowMs)
    if (result.meta_missing) {
      await this.engineService.bootstrapFromDb(userId)
      result = await this.redisService.claimAutoClicker(userId, nowMs)
      if (result.meta_missing) {
        throw new NotFoundException('Clicker state not loaded')
      }
    }

    // No-op claim (apc was already 0) — return the post-call state
    // without writing to history. Avoids spamming the audit log on
    // accidental re-taps. Still bump the no-op metric so we can see
    // double-tap rates.
    if (result.claimed_count === 0 && result.claimed_value === 0) {
      this.metrics.record({
        kind: 'claim',
        claimed_count: 0,
        claimed_value: 0,
      })
      return {
        claimed_count: 0,
        claimed_value: 0,
        points: result.points,
        total_points: result.total_points,
      }
    }

    this.metrics.record({
      kind: 'claim',
      claimed_count: result.claimed_count,
      claimed_value: result.claimed_value,
    })

    // Drain Redis state into PG so the freshly-credited points and
    // zeroed pending columns are visible to the next REST `/me` call.
    // When the claim crossed a level threshold (`level_up_due`),
    // routing through the engine's coalesced handler lets concurrent
    // claim/click flows share the same flush+promote work instead of
    // stacking duplicates. Best-effort — cron flush picks up anything
    // we miss.
    try {
      if (result.level_up_due) {
        await this.engineService.runLevelUp(userId)
      } else {
        await this.flushService.flushUser(userId)
      }
    } catch (err) {
      this.logger.warn(
        `flush-after-claim failed for user ${userId}: ${
          err instanceof Error ? err.message : err
        }`,
      )
    }

    await this.historyService.record({
      user_id: userId,
      action: 'auto_clicker_claim',
      payload: {
        claimed_count: result.claimed_count,
        claimed_value: result.claimed_value,
      },
      state_after: { points: result.points },
      source: 'ws',
      ip: ip ?? null,
    })

    return {
      claimed_count: result.claimed_count,
      claimed_value: result.claimed_value,
      points: result.points,
      total_points: result.total_points,
    }
  }
}
