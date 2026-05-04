import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { ClickerUser } from '../entities/clicker_user.entity'
import { ClickerLevel } from '../../clickerLevels/entities/clicker_level.entity'
import { ClickerLevelsCacheService } from '../services/clicker-levels-cache.service'
import { ClickerRedisService } from './clicker-redis.service'
import {
  FLUSH_CRON_EXPR,
  MAX_FLUSH_BATCH,
} from '../constants/clicker.constants'
import { clickerLog, clickerLogBlock } from '../clicker-debug'

/**
 * Periodically drains accumulated click state from Redis into Postgres.
 *
 * Redis is the source of truth during a session — every click increments a
 * counter there atomically. This service walks the `clicker:dirty` set every
 * 30 seconds and persists the latest snapshot per user, then bumps player
 * level if their points crossed the next threshold.
 *
 * Race-safety with concurrent clicks:
 *  - We `SPOP` user IDs out of the dirty set, so a user being flushed won't
 *    sit there blocking us if they keep clicking — they'll get re-added by
 *    the very next click.
 *  - Reading `points`/`energy` from Redis after the SPOP picks up whatever
 *    value was last written; subsequent clicks just produce a newer value
 *    that the next tick will pick up. No clicks are lost.
 *  - On UPDATE failure we put the IDs back so the next tick retries.
 */
@Injectable()
export class ClickerFlushService implements OnModuleDestroy {
  private readonly logger = new Logger(ClickerFlushService.name)
  private flushing = false
  private destroyed = false

  constructor(
    @InjectRepository(ClickerUser)
    private readonly userRepo: Repository<ClickerUser>,
    private readonly levelsCache: ClickerLevelsCacheService,
    private readonly redisService: ClickerRedisService,
  ) {}

  onModuleDestroy(): void {
    // Best-effort: try to flush whatever is dirty before the process exits.
    // We don't await — Nest gives shutdown hooks a few seconds and we don't
    // want to block. AOF on the Redis side covers the worst case.
    this.destroyed = true
    void this.runFlush().catch(err => {
      this.logger.warn(
        `final flush failed: ${err instanceof Error ? err.message : err}`,
      )
    })
  }

  @Cron(FLUSH_CRON_EXPR, { name: 'clicker-flush' })
  async scheduledFlush(): Promise<void> {
    if (this.flushing || this.destroyed) {
      clickerLog('flush.cron', {
        op: 'skip',
        reason: this.destroyed ? 'destroyed' : 'in-progress',
      })
      return
    }
    this.flushing = true
    const startedAt = Date.now()
    clickerLog('flush.cron', { op: 'tick-start', at_ms: startedAt })
    try {
      await this.runFlush()
      clickerLog('flush.cron', {
        op: 'tick-end',
        duration_ms: Date.now() - startedAt,
      })
    } catch (err) {
      this.logger.error(
        `scheduled flush failed: ${err instanceof Error ? err.message : err}`,
      )
      clickerLog('flush.cron', {
        op: 'tick-failed',
        duration_ms: Date.now() - startedAt,
        err: err instanceof Error ? err.message : String(err),
      })
    } finally {
      this.flushing = false
    }
  }

  /**
   * Force-flush a single user. Used before upgrades so the DB reflects the
   * latest points before we mutate them.
   */
  async flushUser(userId: number): Promise<void> {
    clickerLog('flush.user', { user: userId, op: 'force-flush-start' })
    // Persist before removing from the dirty set so a failure here doesn't
    // leak (we'd lose the dirty marker but the next click re-adds the user).
    await this.persistUsers([userId])
    await this.redisService.removeFromDirty(userId)
    clickerLog('flush.user', { user: userId, op: 'force-flush-end' })
  }

  private async runFlush(): Promise<void> {
    const ids = await this.redisService.drainDirty(MAX_FLUSH_BATCH)
    if (ids.length === 0) {
      clickerLog('flush.cron', { op: 'no-dirty' })
      return
    }
    clickerLog('flush.cron', {
      op: 'drained',
      count: ids.length,
      ids: ids.join(','),
    })

    try {
      await this.persistUsers(ids)
    } catch (err) {
      // Put them back so the next tick retries. Worst case the same set is
      // flushed twice — UPDATE is idempotent on the values we write.
      clickerLog('flush.cron', {
        op: 'persist-failed-rollback',
        ids: ids.join(','),
        err: err instanceof Error ? err.message : String(err),
      })
      await this.redisService.markDirtyMany(ids).catch(() => undefined)
      throw err
    }
  }

  private async persistUsers(userIds: number[]): Promise<void> {
    if (userIds.length === 0) return

    const states = await Promise.all(
      userIds.map(async uid => ({
        userId: uid,
        snapshot: await this.redisService.getState(uid),
      })),
    )

    const writable = states.filter(
      s =>
        s.snapshot.points != null &&
        s.snapshot.energy != null &&
        s.snapshot.ts != null,
    )
    const skipped = states.filter(
      s =>
        s.snapshot.points == null ||
        s.snapshot.energy == null ||
        s.snapshot.ts == null,
    )
    if (skipped.length > 0) {
      clickerLog('flush.persist', {
        op: 'skipped-empty-snapshot',
        users: skipped.map(s => s.userId).join(','),
      })
    }
    if (writable.length === 0) return

    for (const { userId, snapshot } of writable) {
      clickerLogBlock(
        'flush.persist',
        { user: userId, op: 'redis-snapshot' },
        [
          [
            'pg-write',
            {
              points: snapshot.points,
              total_points: snapshot.total_points ?? snapshot.points,
              energy: snapshot.energy,
              last_energy_update_ms: snapshot.ts,
              apc: snapshot.auto_clicker_pending_count ?? 0,
              apv: snapshot.auto_clicker_pending_value ?? 0,
            },
          ],
        ],
      )
    }

    await Promise.all(
      writable.map(({ userId, snapshot }) =>
        this.userRepo.update(
          { user_id: userId },
          {
            points: snapshot.points!,
            // Lifetime tally — persist alongside the spendable balance.
            // The level bump check below reads from `total_points`
            // (PG) on cold paths and from `tp` (Redis) on the hot
            // Lua path; flushing keeps them in sync. Falls back to
            // current points if the snapshot omits it (warm key from
            // pre-tp deploys, etc.) — guarantees PG never goes
            // backwards on the lifetime field.
            total_points: snapshot.total_points ?? snapshot.points!,
            energy_amount: snapshot.energy!,
            last_energy_update: new Date(snapshot.ts!),
            // Persist the autoclicker bank too — without this, a
            // 7-day Redis TTL eviction silently drops whatever the
            // player accumulated but never claimed. apc/apv default
            // to 0 in PG so a missing snapshot value (cold user,
            // pre-migration row) writes 0 cleanly.
            auto_clicker_pending_count:
              snapshot.auto_clicker_pending_count ?? 0,
            auto_clicker_pending_value:
              snapshot.auto_clicker_pending_value ?? 0,
          },
        ),
      ),
    )

    await this.maybeBumpLevels(writable.map(w => w.userId))
  }

  /**
   * After writing fresh `points`, see if any of these users crossed the next
   * level threshold and bump them. This isn't an outer cron because we have
   * the user IDs right here and reading levels is cheap (cached in memory).
   */
  private async maybeBumpLevels(userIds: number[]): Promise<void> {
    if (userIds.length === 0) return

    const levels = await this.levelsCache.getBunnyLevels()
    if (levels.length === 0) return

    const users = await this.userRepo.find({
      where: { user_id: In(userIds) },
      relations: ['level'],
    })

    for (const user of users) {
      const currentId = user.level?.id ?? 0
      // Promote off the lifetime tally rather than the spendable
      // balance — without that switch a player who climbed past the
      // threshold then spent some carrots in the same flush window
      // would silently miss the level bump.
      const tally = user.total_points ?? user.points
      const target = this.findHighestQualifyingLevel(levels, currentId, tally)
      if (target && target.id !== currentId) {
        // Compute the post-promotion next-level threshold here while
        // we already have `levels` in memory — avoids another levelsCache
        // round-trip inside updateLevelMeta. 0 means "at max tier".
        const nextLevelCost = this.findNextThreshold(levels, target.id)
        clickerLog('flush.levelup', {
          user: user.user_id,
          op: 'promote',
          from_level_id: currentId,
          to_level_id: target.id,
          next_level_cost: nextLevelCost,
          tally,
          threshold: target.points_required,
        })
        user.level = target
        await this.userRepo.save(user)
        // Atomic level-meta update — replaces the older
        // clearMeta-then-bootstrap dance which had a torn-read window
        // (Lua could read meta_missing while clearMeta was visible but
        // bootstrap hadn't yet run, triggering a redundant PG round-trip
        // and racing concurrent click batches into stale-snapshot
        // overwrites). HMSET is atomic at the field level.
        await this.redisService.updateLevelMeta(
          user.user_id,
          target.id,
          nextLevelCost,
        )
        clickerLog('flush.levelup', {
          user: user.user_id,
          op: 'meta-updated',
        })
      }
    }
  }

  private findNextThreshold(
    levels: ClickerLevel[],
    currentId: number,
  ): number {
    // levels are sorted by `findHighestQualifyingLevel`'s caller in
    // ascending id order. Linear scan is fine — clicker level catalogs
    // are small (sub-50 entries).
    let crossedCurrent = false
    for (const lv of levels) {
      if (crossedCurrent) return lv.points_required
      if (lv.id === currentId) crossedCurrent = true
    }
    return 0
  }

  private findHighestQualifyingLevel(
    levels: ClickerLevel[],
    currentId: number,
    points: number,
  ): ClickerLevel | null {
    let best: ClickerLevel | null = null
    for (const lv of levels) {
      if (lv.id <= currentId) continue
      if (points >= lv.points_required) best = lv
      else break
    }
    return best
  }

}
