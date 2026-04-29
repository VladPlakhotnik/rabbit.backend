import { Inject, Injectable, Logger } from '@nestjs/common'
import Redis from 'ioredis'
import {
  REDIS_CLIENT,
  REDIS_SUBSCRIBER,
} from '../../core/redis/redis.constants'
import {
  MAX_FEED_SIZE,
  REDIS_FEED_KEY,
  REDIS_PUBSUB_CHANNEL,
} from './constants/events'
import type { LiveDropPayload } from './types'

type DropHandler = (drop: LiveDropPayload) => void

@Injectable()
export class LiveDropsService {
  private readonly logger = new Logger(LiveDropsService.name)
  private subscribed = false
  private readonly handlers = new Set<DropHandler>()

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(REDIS_SUBSCRIBER) private readonly subscriber: Redis,
  ) {}

  /**
   * Push a drop into the feed and notify all gateway instances.
   *
   * The three ops run in a MULTI pipeline so a Pub/Sub message can never
   * arrive for a drop that isn't yet in the list — that would race with new
   * connections calling getRecent() right after subscribing.
   *
   * Failures are logged but never thrown: a non-critical livedrop hiccup
   * must not break the case-opening flow that called us.
   */
  async pushDrop(drop: LiveDropPayload): Promise<void> {
    const json = JSON.stringify(drop)
    try {
      await this.redis
        .multi()
        .lpush(REDIS_FEED_KEY, json)
        .ltrim(REDIS_FEED_KEY, 0, MAX_FEED_SIZE - 1)
        .publish(REDIS_PUBSUB_CHANNEL, json)
        .exec()
    } catch (err) {
      this.logger.error(
        `pushDrop failed: ${(err as Error).message}`,
        (err as Error).stack,
      )
    }
  }

  async getRecent(): Promise<LiveDropPayload[]> {
    try {
      const items = await this.redis.lrange(
        REDIS_FEED_KEY,
        0,
        MAX_FEED_SIZE - 1,
      )
      return items.reduce<LiveDropPayload[]>((acc, raw) => {
        try {
          acc.push(JSON.parse(raw) as LiveDropPayload)
        } catch {
          // skip corrupted entry; surfacing it would break the whole feed
        }
        return acc
      }, [])
    } catch (err) {
      this.logger.error(`getRecent failed: ${(err as Error).message}`)
      return []
    }
  }

  /**
   * Register a handler called for every drop published cluster-wide.
   *
   * Only one SUBSCRIBE is issued to Redis regardless of how many handlers
   * are registered — handlers are fanned out in-process. This matters when
   * other modules (e.g. metrics, audit) want to observe the feed without
   * each opening its own subscriber connection.
   */
  async onDrop(handler: DropHandler): Promise<void> {
    this.handlers.add(handler)

    if (!this.subscribed) {
      await this.subscriber.subscribe(REDIS_PUBSUB_CHANNEL)
      this.subscriber.on('message', (channel, message) => {
        if (channel !== REDIS_PUBSUB_CHANNEL) return
        let drop: LiveDropPayload
        try {
          drop = JSON.parse(message) as LiveDropPayload
        } catch (err) {
          this.logger.error(
            `Failed to parse drop message: ${(err as Error).message}`,
          )
          return
        }
        for (const h of this.handlers) {
          try {
            h(drop)
          } catch (err) {
            this.logger.error(
              `Drop handler threw: ${(err as Error).message}`,
              (err as Error).stack,
            )
          }
        }
      })
      this.subscribed = true
    }
  }
}
