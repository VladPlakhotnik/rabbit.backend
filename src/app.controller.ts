import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import Redis from 'ioredis'
import * as os from 'os'
import { REDIS_CLIENT } from './core/redis/redis.constants'

const REDIS_PING_TIMEOUT_MS = 1_000

type DependencyStatus = 'ok' | 'error'

@ApiTags('health')
@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name)

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Get('health')
  async healthCheck() {
    const uptime = process.uptime()
    const memoryUsage = process.memoryUsage()

    const checks = {
      redis: await this.pingRedis(),
    }

    const allHealthy = Object.values(checks).every(s => s === 'ok')
    const status = allHealthy ? 'ok' : 'degraded'

    const body = {
      status,
      timestamp: new Date().toISOString(),
      uptime: {
        seconds: Math.floor(uptime),
        formatted: this.formatUptime(uptime),
      },
      memory: {
        total: this.formatBytes(memoryUsage.heapTotal),
        used: this.formatBytes(memoryUsage.heapUsed),
        external: this.formatBytes(memoryUsage.external),
        rss: this.formatBytes(memoryUsage.rss),
      },
      system: {
        platform: process.platform,
        nodeVersion: process.version,
        cpuCount: os.cpus().length,
        totalMemory: this.formatBytes(os.totalmem()),
        freeMemory: this.formatBytes(os.freemem()),
        loadAverage: os.loadavg(),
      },
      checks,
    }

    // Return 503 when a critical dependency is down so Heroku's router and
    // any external uptime monitor can pick up the degraded state. Without
    // this the endpoint always responds 200 and a Redis outage stays
    // invisible until the first user-facing request fails.
    if (!allHealthy) {
      throw new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE)
    }

    return body
  }

  /**
   * Round-trip PING with a hard timeout. ioredis' built-in retry loop
   * could otherwise stall the healthcheck for tens of seconds while the
   * client tries to reconnect — we want a fast verdict.
   */
  private async pingRedis(): Promise<DependencyStatus> {
    try {
      const pong = await Promise.race([
        this.redis.ping(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('redis ping timeout')),
            REDIS_PING_TIMEOUT_MS,
          ),
        ),
      ])
      return pong === 'PONG' ? 'ok' : 'error'
    } catch (err) {
      this.logger.warn(`Redis healthcheck failed: ${(err as Error).message}`)
      return 'error'
    }
  }

  private formatUptime(uptime: number): string {
    const days = Math.floor(uptime / 86400)
    const hours = Math.floor((uptime % 86400) / 3600)
    const minutes = Math.floor((uptime % 3600) / 60)
    const seconds = Math.floor(uptime % 60)

    return `${days}d ${hours}h ${minutes}m ${seconds}s`
  }

  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB']
    let size = bytes
    let unitIndex = 0

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`
  }
}
