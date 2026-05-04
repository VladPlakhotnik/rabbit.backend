import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import type { Cache } from 'cache-manager'
import {
  DataSource,
  type EntitySubscriberInterface,
  type InsertEvent,
  type RemoveEvent,
  type UpdateEvent,
} from 'typeorm'
import { User } from '../users/user.entity'
import { jwtUserCacheKey } from './jwt-user-cache-key'

/**
 * Drops the JwtStrategy's cached User row whenever the underlying
 * `users` row changes through TypeORM. Replaces the manual
 * `invalidateJwtUserCache(userId)` calls that UserService used to
 * scatter after every mutation — easy to forget on the 11th method
 * someone adds, easy to mis-fire after a partial write.
 *
 * IMPORTANT — what this subscriber sees:
 *
 *   • `repository.save(entity)`           → event.entity is the full
 *                                            entity, event.entity.id
 *                                            is set. Works.
 *   • `repository.save({id, ...partial})` → same. Works.
 *   • `manager.save(...)` in transactions → same. Works.
 *   • `repository.update(criteria, ...)`  → event.entity is the
 *                                            *partial* (no id), no
 *                                            criteria on the event.
 *                                            Subscriber CANNOT extract
 *                                            the user id. UserService
 *                                            uses save() exclusively
 *                                            for that reason.
 *   • `repository.increment(...)`         → same broken event shape as
 *                                            update(). UserService
 *                                            falls back to a manual
 *                                            invalidate for the one
 *                                            hot-path increment.
 *   • `manager.query('UPDATE users …')`   → bypasses subscribers
 *                                            entirely. UserService
 *                                            falls back to a manual
 *                                            invalidate for the two
 *                                            big-Steam-ID raw-SQL
 *                                            paths (rare).
 *
 * Registration: this class is a Nest provider (so it can inject
 * CACHE_MANAGER) and pushes itself onto `dataSource.subscribers` from
 * the constructor. The `@EventSubscriber()` decorator from TypeORM
 * isn't used — that path constructs the subscriber outside Nest's DI
 * container, so the cache wouldn't get injected.
 */
@Injectable()
export class JwtUserCacheSubscriber
  implements EntitySubscriberInterface<User>
{
  private readonly logger = new Logger(JwtUserCacheSubscriber.name)

  constructor(
    @InjectDataSource() dataSource: DataSource,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {
    dataSource.subscribers.push(this)
  }

  // Restricts the subscriber to User events only — without this it
  // would fire for every entity in the data source, costing a useless
  // cache lookup on every save anywhere.
  listenTo() {
    return User
  }

  async afterInsert(event: InsertEvent<User>): Promise<void> {
    // New user just appeared — there's nothing in the cache for them
    // yet, but the next /auth/refresh will hit JwtStrategy and cache
    // the row. Pre-emptive invalidate is harmless and keeps the
    // subscriber's behaviour symmetric across all three lifecycle
    // events (no special "skip on insert" branch to remember later).
    await this.invalidate(event.entity.id)
  }

  async afterUpdate(event: UpdateEvent<User>): Promise<void> {
    // For save() flows event.entity is the full entity, so .id is set.
    // For update()/increment() flows it's the partial without id —
    // see class-level comment for the explicit fallback strategy.
    const entity = event.entity as User | undefined
    if (entity && typeof entity.id === 'number') {
      await this.invalidate(entity.id)
      return
    }
    // databaseEntity is populated for save/remove/softRemove/recover
    // but not for QueryBuilder updates. Fall through if neither.
    if (event.databaseEntity && typeof event.databaseEntity.id === 'number') {
      await this.invalidate(event.databaseEntity.id)
    }
  }

  async afterRemove(event: RemoveEvent<User>): Promise<void> {
    if (event.entity && typeof (event.entity as User).id === 'number') {
      await this.invalidate((event.entity as User).id)
      return
    }
    if (event.databaseEntity && typeof event.databaseEntity.id === 'number') {
      await this.invalidate(event.databaseEntity.id)
    }
  }

  private async invalidate(userId: number): Promise<void> {
    try {
      await this.cache.del(jwtUserCacheKey(userId))
    } catch (err) {
      // Cache failures here are non-fatal: worst case is one stale
      // request before the 30 s TTL expires. Never escalate to a 500
      // on the caller's mutation.
      this.logger.warn(
        `Failed to invalidate jwt user cache for ${userId}: ${
          err instanceof Error ? err.message : 'Unknown error'
        }`,
      )
    }
  }
}
