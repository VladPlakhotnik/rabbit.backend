import { Inject, Injectable, Logger } from '@nestjs/common'
import Redis from 'ioredis'
import { REDIS_CLIENT } from '../../../core/redis/redis.constants'

/**
 * Daily counters for the clicker hot path. Each event bumps a small
 * set of HINCRBY fields on a per-day key
 * (`clicker:v5:metrics:YYYY-MM-DD`); admins / dashboards read with a
 * plain HGETALL.
 *
 * Why TS-side and not inside the click Lua: keeping it out of the Lua
 * script means no extra Redis ops on the atomic hot path — the
 * counter writes go in a fire-and-forget pipeline AFTER the Lua call
 * returns, so a metrics blip never delays an ack.
 *
 * The counters are intentionally thin — anything richer (per-user
 * stats, time-series) goes through clicker_history. These are for
 * "is the system alive and at what cps" answers.
 */

type MetricEvent =
  | { kind: 'click'; accepted: number; auto_credited: number; crit_count: number; level_up: boolean }
  | { kind: 'claim'; claimed_count: number; claimed_value: number }
  | { kind: 'boost_activated'; boost_key: string }
  | { kind: 'spend'; cost: number }
  | { kind: 'error'; reason: string }

const METRICS_KEY_PREFIX = 'clicker:v5:metrics'
// 30-day retention: one TS rotation per month is plenty given the
// keys are only ever read by admin dashboards.
const METRICS_KEY_TTL_SECONDS = 30 * 24 * 60 * 60

@Injectable()
export class ClickerMetricsService {
  private readonly logger = new Logger(ClickerMetricsService.name)

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Bump the appropriate counters for a single event. Fire-and-forget
   * — never throws upstream; metric storage failures get logged at
   * warn level and silently swallowed so a Redis hiccup never blocks
   * a click ack.
   */
  record(event: MetricEvent): void {
    void this.recordInner(event).catch(err => {
      this.logger.warn(
        `metric write failed (${event.kind}): ${
          err instanceof Error ? err.message : err
        }`,
      )
    })
  }

  /**
   * Read today's counters. Used by the future admin dashboard /
   * health endpoint. Keys default to 0 for fields that haven't been
   * incremented yet today.
   */
  async readToday(): Promise<Record<string, number>> {
    const key = this.dayKey(Date.now())
    const raw = await this.redis.hgetall(key)
    const parsed: Record<string, number> = {}
    for (const [field, value] of Object.entries(raw)) {
      const n = Number(value)
      parsed[field] = Number.isFinite(n) ? n : 0
    }
    return parsed
  }

  // ---- internals --------------------------------------------------------

  private async recordInner(event: MetricEvent): Promise<void> {
    const key = this.dayKey(Date.now())
    const pipe = this.redis.multi()
    pipe.hincrby(key, 'lua_calls', 1)

    switch (event.kind) {
      case 'click':
        if (event.accepted > 0) {
          pipe.hincrby(key, 'manual_clicks', event.accepted)
        }
        if (event.auto_credited > 0) {
          pipe.hincrby(key, 'auto_clicks', event.auto_credited)
        }
        if (event.crit_count > 0) {
          pipe.hincrby(key, 'crits', event.crit_count)
        }
        if (event.level_up) {
          pipe.hincrby(key, 'level_ups', 1)
        }
        break
      case 'claim':
        pipe.hincrby(key, 'claims', 1)
        if (event.claimed_count > 0) {
          pipe.hincrby(key, 'claimed_clicks', event.claimed_count)
          pipe.hincrby(key, 'claimed_points', event.claimed_value)
        } else {
          pipe.hincrby(key, 'claims_noop', 1)
        }
        break
      case 'boost_activated':
        pipe.hincrby(key, 'boost_activated', 1)
        pipe.hincrby(key, `boost_activated:${event.boost_key}`, 1)
        break
      case 'spend':
        pipe.hincrby(key, 'spends', 1)
        pipe.hincrby(key, 'spent_points', event.cost)
        break
      case 'error':
        pipe.hincrby(key, 'errors', 1)
        pipe.hincrby(key, `errors:${event.reason}`, 1)
        break
    }

    pipe.expire(key, METRICS_KEY_TTL_SECONDS)
    await pipe.exec()
  }

  private dayKey(nowMs: number): string {
    const d = new Date(nowMs)
    const yyyy = d.getUTCFullYear()
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(d.getUTCDate()).padStart(2, '0')
    return `${METRICS_KEY_PREFIX}:${yyyy}-${mm}-${dd}`
  }
}
