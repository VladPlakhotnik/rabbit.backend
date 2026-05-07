import * as crypto from 'crypto'
import { ConflictException, Injectable, Logger } from '@nestjs/common'
import { Inject } from '@nestjs/common'
import Redis from 'ioredis'
import { REDIS_CLIENT } from '../redis/redis.constants'

const IDEMPOTENCY_RESULT_TTL_SECONDS = 24 * 60 * 60
const IDEMPOTENCY_PROCESSING_TTL_SECONDS = 60
const IDEMPOTENCY_KEY_MAX_LENGTH = 160

interface StoredIdempotencyResult<T> {
  status: 'done'
  result: T
}

interface StoredIdempotencyProcessing {
  status: 'processing'
  startedAtMs: number
}

type StoredIdempotencyEntry<T> =
  | StoredIdempotencyResult<T>
  | StoredIdempotencyProcessing

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name)

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async run<T>(
    scope: string,
    actorId: number | string,
    rawKey: string | string[] | undefined,
    handler: () => Promise<T>,
  ): Promise<T> {
    const key = this.normaliseKey(rawKey)
    if (!key) return handler()

    const redisKey = this.redisKey(scope, actorId, key)
    const processing: StoredIdempotencyProcessing = {
      status: 'processing',
      startedAtMs: Date.now(),
    }
    const acquired = await this.redis.set(
      redisKey,
      JSON.stringify(processing),
      'EX',
      IDEMPOTENCY_PROCESSING_TTL_SECONDS,
      'NX',
    )

    if (acquired === 'OK') {
      try {
        const result = await handler()
        const done: StoredIdempotencyResult<T> = { status: 'done', result }
        await this.redis.set(
          redisKey,
          JSON.stringify(done),
          'EX',
          IDEMPOTENCY_RESULT_TTL_SECONDS,
        )
        return result
      } catch (err) {
        await this.redis.del(redisKey).catch((deleteErr) => {
          this.logger.warn(
            `failed to clear failed idempotency key ${redisKey}: ${
              deleteErr instanceof Error ? deleteErr.message : deleteErr
            }`,
          )
        })
        throw err
      }
    }

    const stored = await this.readStored<T>(redisKey)
    if (stored?.status === 'done') return stored.result
    throw new ConflictException('Request with this idempotency key is still processing')
  }

  private normaliseKey(rawKey: string | string[] | undefined): string | null {
    const value = Array.isArray(rawKey) ? rawKey[0] : rawKey
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    if (!trimmed) return null
    return trimmed.slice(0, IDEMPOTENCY_KEY_MAX_LENGTH)
  }

  private redisKey(scope: string, actorId: number | string, key: string): string {
    const digest = crypto.createHash('sha256').update(key).digest('hex')
    return `clicker:idempotency:${scope}:${actorId}:${digest}`
  }

  private async readStored<T>(
    redisKey: string,
  ): Promise<StoredIdempotencyEntry<T> | null> {
    const raw = await this.redis.get(redisKey)
    if (!raw) return null
    try {
      return JSON.parse(raw) as StoredIdempotencyEntry<T>
    } catch {
      return null
    }
  }
}
