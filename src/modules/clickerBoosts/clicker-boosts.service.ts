import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { ClickerUser } from '../clickerUser/entities/clicker_user.entity'
import { ClickerFlushService } from '../clickerUser/redis/clicker-flush.service'
import { ClickerRedisService } from '../clickerUser/redis/clicker-redis.service'
import { ClickerHistoryService } from '../clickerHistory/clicker-history.service'
import { ClickerBoost } from './entities/clicker_boost.entity'
import { ClickerUserBoost } from './entities/clicker_user_boost.entity'

@Injectable()
export class ClickerBoostsService {
  constructor(
    @InjectRepository(ClickerBoost)
    private readonly boostRepo: Repository<ClickerBoost>,
    @InjectRepository(ClickerUserBoost)
    private readonly inventoryRepo: Repository<ClickerUserBoost>,
    private readonly flushService: ClickerFlushService,
    private readonly redisService: ClickerRedisService,
    private readonly historyService: ClickerHistoryService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Public catalog. Soft-locked rows (`is_available = false`) are
   * filtered out — admin can pull a boost without DELETEing it, and
   * the public API treats it as if it never existed.
   */
  findCatalog(): Promise<ClickerBoost[]> {
    return this.boostRepo.find({
      where: { is_available: true },
      order: { id: 'ASC' },
    })
  }

  /** Stockpile rows for a single user. Empty array when nothing owned. */
  findInventory(userId: number): Promise<ClickerUserBoost[]> {
    return this.inventoryRepo.find({
      where: { user_id: userId },
      order: { boost_key: 'ASC' },
    })
  }

  /**
   * Buy one copy of `boostKey`.
   *
   * Safety:
   * - Catalog lookup pre-flight: rejects unknown / soft-locked keys
   *   with 404 (same shape as if the row never existed → admin state
   *   stays opaque).
   * - Pessimistic write lock on clicker_users for the deduct step —
   *   two concurrent buys can't both pass the affordability check.
   * - UPSERT on the inventory row inside the same transaction — if
   *   the lock holds and the deduct succeeds, the count update is
   *   guaranteed to commit alongside.
   * - Audit log written on success (action = buy_boost).
   *
   * Bypasses Redis state for the points balance: we flush PG first,
   * mutate PG, then clear Redis. Same pattern as upgradeSkill — buy
   * is rare relative to clicks, and PG-as-truth is simpler / safer
   * than juggling Redis.
   */
  async buy(
    userId: number,
    boostKey: string,
    ip?: string | null,
  ): Promise<{
    boostKey: string
    count: number
    points: number
  }> {
    const boost = await this.boostRepo.findOne({
      where: { key: boostKey, is_available: true },
    })
    if (!boost) {
      // 404 not 400 — the player can't tell unknown-key from
      // pulled-by-admin. Same security posture as cases.findBySlug.
      throw new NotFoundException('Boost not found')
    }

    // Drain Redis → PG so we lock against the freshest balance.
    await this.flushService.flushUser(userId)

    const result = await this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(ClickerUser, {
        where: { user_id: userId },
        lock: { mode: 'pessimistic_write' },
      })
      if (!user) {
        throw new NotFoundException('Clicker profile not found')
      }
      if (user.points < boost.price) {
        throw new BadRequestException('Not enough points to buy this boost')
      }

      const stateBefore = { points: user.points }
      user.points -= boost.price
      await manager.save(user)

      // UPSERT: increment if exists, otherwise insert with count=1.
      // Inline parameterised SQL keeps it one round-trip; the ORM
      // upsert path doesn't quite fit composite primary keys.
      await manager.query(
        `INSERT INTO clicker_user_boosts (user_id, boost_key, count, updated_at)
         VALUES ($1, $2, 1, NOW())
         ON CONFLICT (user_id, boost_key)
         DO UPDATE SET count = clicker_user_boosts.count + 1,
                       updated_at = NOW()`,
        [userId, boostKey],
      )

      const updated = await manager.findOne(ClickerUserBoost, {
        where: { user_id: userId, boost_key: boostKey },
      })
      const newCount = updated?.count ?? 1

      return {
        stateBefore,
        stateAfter: {
          points: user.points,
          [`boost_${boostKey}_count`]: newCount,
        },
        points: user.points,
        count: newCount,
      }
    })

    await this.redisService.clearUser(userId)

    await this.historyService.record({
      user_id: userId,
      action: 'buy_boost',
      payload: { boost_key: boostKey, price: boost.price },
      state_before: result.stateBefore,
      state_after: result.stateAfter,
      source: 'ws',
      ip: ip ?? null,
    })

    return {
      boostKey,
      count: result.count,
      points: result.points,
    }
  }
}
