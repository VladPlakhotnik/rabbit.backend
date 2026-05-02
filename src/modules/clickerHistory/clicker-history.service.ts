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
}
