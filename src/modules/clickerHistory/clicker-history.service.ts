import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  ClickerHistory,
  type ClickerHistoryAction,
  type ClickerHistorySource,
} from './entities/clicker_history.entity'

interface RecordParams {
  user_id: number
  action: ClickerHistoryAction
  payload?: Record<string, unknown> | null
  state_before?: Record<string, unknown> | null
  state_after?: Record<string, unknown> | null
  source?: ClickerHistorySource
  ip?: string | null
}

export interface ActiveBoostRecoveryAudit {
  boost_key: string
  expires_at_ms: number
  duration_sec: number
  effect_type: string
  effect_value: number
}

/**
 * Append-only writer for clicker_history. Every state-changing clicker
 * operation lands one row here BEFORE returning the response to the
 * client (so that even if a downstream LiveDrop / WS push fails, the
 * audit row is already committed).
 *
 * Errors here are logged + swallowed: the audit log is supporting
 * infrastructure, not the critical path. Refusing to grant the player
 * their upgrade because the log table briefly hiccupped would create a
 * worse user experience than a small forensic gap. Production must
 * monitor the log table size growth so an outage is noticed.
 */
@Injectable()
export class ClickerHistoryService {
  private readonly logger = new Logger(ClickerHistoryService.name)

  constructor(
    @InjectRepository(ClickerHistory)
    private readonly repo: Repository<ClickerHistory>,
  ) {}

  async record(params: RecordParams): Promise<void> {
    try {
      // `as any` on the jsonb fields — TypeORM's strict QueryDeepPartial
      // type insists on a callable-or-DeepPartial union for json columns,
      // even though we're handing it a plain object. Cast is local to
      // this insert.
      await this.repo.save(
        this.repo.create({
          user_id: params.user_id,
          action: params.action,
          payload: (params.payload ?? null) as never,
          state_before: (params.state_before ?? null) as never,
          state_after: (params.state_after ?? null) as never,
          source: params.source ?? 'ws',
          ip: params.ip ?? null,
        }),
      )
    } catch (err) {
      this.logger.error(
        `audit insert failed user=${params.user_id} action=${params.action}: ${
          err instanceof Error ? err.message : err
        }`,
      )
      // Intentionally swallow — see class docs.
    }
  }

  async findLatestUnexpiredActiveBoost(
    userId: number,
    nowMs: number,
  ): Promise<ActiveBoostRecoveryAudit | null> {
    const row = await this.repo
      .createQueryBuilder('h')
      .where('h.user_id = :userId', { userId })
      .andWhere('h.action = :action', { action: 'activate_boost' })
      .andWhere("(h.state_after ->> 'expires_at_ms')::bigint > :nowMs", {
        nowMs,
      })
      .orderBy('h.ts', 'DESC')
      .limit(1)
      .getOne()
    if (!row) return null

    const payload = row.payload ?? {}
    const stateAfter = row.state_after ?? {}
    const boostKey = this.stringField(payload, 'boost_key')
    const effectType = this.stringField(payload, 'effect_type')
    const expiresAtMs = this.numberField(stateAfter, 'expires_at_ms')
    if (!boostKey || !effectType || expiresAtMs <= nowMs) return null
    return {
      boost_key: boostKey,
      expires_at_ms: expiresAtMs,
      duration_sec: this.numberField(payload, 'duration_sec'),
      effect_type: effectType,
      effect_value: this.recoveredEffectValue(payload, effectType),
    }
  }

  private stringField(
    source: Record<string, unknown>,
    key: string,
  ): string {
    const value = source[key]
    return typeof value === 'string' ? value : ''
  }

  private numberField(
    source: Record<string, unknown>,
    key: string,
  ): number {
    const raw = source[key]
    const value = typeof raw === 'number' ? raw : Number(raw)
    return Number.isFinite(value) ? value : 0
  }

  private recoveredEffectValue(
    source: Record<string, unknown>,
    effectType: string,
  ): number {
    const value = this.numberField(source, 'effect_value')
    if (value > 0) return value
    return effectType === 'multiplier' ? 10 : 0
  }
}
