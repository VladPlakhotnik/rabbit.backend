import {
  Global,
  Inject,
  Logger,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common'
import Redis from 'ioredis'
import { REDIS_CLIENT, REDIS_SUBSCRIBER } from './redis.constants'

const DEFAULT_URL = 'redis://localhost:6379'

const buildClient = (label: string, logger: Logger): Redis => {
  const url = process.env.REDIS_URL || process.env.REDISCLOUD_URL || DEFAULT_URL
  const client = new Redis(url, {
    // Don't queue commands forever if Redis is unreachable — fail fast so the
    // caller can fall back gracefully (e.g. skip a non-critical pushDrop).
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  })

  client.on('connect', () => logger.log(`[${label}] connected`))
  client.on('error', err => logger.error(`[${label}] error: ${err.message}`))
  client.on('close', () => logger.warn(`[${label}] connection closed`))

  return client
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: () => buildClient('redis-cmd', new Logger('RedisModule')),
    },
    {
      provide: REDIS_SUBSCRIBER,
      useFactory: () => buildClient('redis-sub', new Logger('RedisModule')),
    },
  ],
  exports: [REDIS_CLIENT, REDIS_SUBSCRIBER],
})
export class RedisModule implements OnApplicationShutdown {
  private readonly logger = new Logger(RedisModule.name)

  constructor(
    @Inject(REDIS_CLIENT) private readonly client: Redis,
    @Inject(REDIS_SUBSCRIBER) private readonly subscriber: Redis,
  ) {}

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(`Closing Redis connections (signal: ${signal ?? 'n/a'})`)
    // `quit()` waits for pending replies; `disconnect()` would drop them.
    await Promise.allSettled([this.client.quit(), this.subscriber.quit()])
  }
}
