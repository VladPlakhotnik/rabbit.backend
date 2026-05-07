import { Inject, Injectable, Logger } from '@nestjs/common'
import Redis from 'ioredis'
import {
  REDIS_CLIENT,
  REDIS_SUBSCRIBER,
} from '../../../core/redis/redis.constants'
import {
  MINES_LIVE_MAX_FEED_SIZE,
  MINES_LIVE_REDIS_FEED_KEY,
  MINES_LIVE_REDIS_PUBSUB_CHANNEL,
} from './mines-live.constants'
import type { MinesLiveDropPayload } from './mines-live.types'

type MinesDropHandler = (drop: MinesLiveDropPayload) => void

@Injectable()
export class MinesLiveService {
  private readonly logger = new Logger(MinesLiveService.name)
  private subscribed = false
  private readonly handlers = new Set<MinesDropHandler>()

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(REDIS_SUBSCRIBER) private readonly subscriber: Redis,
  ) {}

  async pushDrop(drop: MinesLiveDropPayload): Promise<void> {
    const json = JSON.stringify(drop)

    try {
      await this.redis
        .multi()
        .lpush(MINES_LIVE_REDIS_FEED_KEY, json)
        .ltrim(MINES_LIVE_REDIS_FEED_KEY, 0, MINES_LIVE_MAX_FEED_SIZE - 1)
        .publish(MINES_LIVE_REDIS_PUBSUB_CHANNEL, json)
        .exec()
    } catch (err) {
      this.logger.error(
        `pushDrop failed: ${(err as Error).message}`,
        (err as Error).stack,
      )
    }
  }

  async getRecent(): Promise<MinesLiveDropPayload[]> {
    try {
      const items = await this.redis.lrange(
        MINES_LIVE_REDIS_FEED_KEY,
        0,
        MINES_LIVE_MAX_FEED_SIZE - 1,
      )

      return items.reduce<MinesLiveDropPayload[]>((acc, raw) => {
        try {
          acc.push(JSON.parse(raw) as MinesLiveDropPayload)
        } catch {
          // Skip corrupted entries so one bad Redis item cannot break the feed.
        }

        return acc
      }, [])
    } catch (err) {
      this.logger.error(`getRecent failed: ${(err as Error).message}`)

      return []
    }
  }

  async onDrop(handler: MinesDropHandler): Promise<void> {
    this.handlers.add(handler)

    if (!this.subscribed) {
      await this.subscriber.subscribe(MINES_LIVE_REDIS_PUBSUB_CHANNEL)
      this.subscriber.on('message', (channel, message) => {
        if (channel !== MINES_LIVE_REDIS_PUBSUB_CHANNEL) return

        let drop: MinesLiveDropPayload

        try {
          drop = JSON.parse(message) as MinesLiveDropPayload
        } catch (err) {
          this.logger.error(
            `Failed to parse mines live message: ${(err as Error).message}`,
          )
          return
        }

        for (const h of this.handlers) {
          try {
            h(drop)
          } catch (err) {
            this.logger.error(
              `Mines drop handler threw: ${(err as Error).message}`,
              (err as Error).stack,
            )
          }
        }
      })
      this.subscribed = true
    }
  }
}
