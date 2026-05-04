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
    if (this.flushing || this.destroyed) return
    this.flushing = true
    try {
      await this.runFlush()
    } catch (err) {
      this.logger.error(
        `scheduled flush failed: ${err instanceof Error ? err.message : err}`,
      )
    } finally {
      this.flushing = false
    }
  }

  /**
   * Force-flush a single user. Used before upgrades so the DB reflects the
   * latest points before we mutate them.
   */
  async flushUser(userId: number): Promise<void> {
    // Persist before removing from the dirty set so a failure here doesn't
    // leak (we'd lose the dirty marker but the next click re-adds the user).
    await this.persistUsers([userId])
    await this.redisService.removeFromDirty(userId)
  }

  private async runFlush(): Promise<void> {
    const ids = await this.redisService.drainDirty(MAX_FLUSH_BATCH)
    if (ids.length === 0) return

    try {
      await this.persistUsers(ids)
    } catch (err) {
      // Put them back so the next tick retries. Worst case the same set is
      // flushed twice — UPDATE is idempotent on the values we write.
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
    if (writable.length === 0) return

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
      const target = this.findHighestQualifyingLevel(
        levels,
        currentId,
        user.total_points ?? user.points,
      )
      if (target && target.id !== currentId) {
        user.level = target
        await this.userRepo.save(user)
        // Bunny advanced — drop the cached meta hash so the next click
        // reloads the fresh level_id / next_level_cost from Postgres.
        // State (points/energy/ts) is left intact.
        await this.redisService.clearMeta(user.user_id)
      }
    }
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
