import { Inject, Injectable, Logger } from '@nestjs/common'
import Redis from 'ioredis'
import { REDIS_CLIENT } from '../redis/redis.constants'

const CLICKER_CATALOG_AUDIT_STREAM = 'clicker:admin:catalog:audit'
const CLICKER_CATALOG_AUDIT_MAXLEN = 10_000

export interface CatalogAuditRecord {
  adminId?: string | null
  adminEmail?: string | null
  entity: string
  action: string
  params?: unknown
  body?: unknown
  result?: unknown
}

@Injectable()
export class CatalogAuditService {
  private readonly logger = new Logger(CatalogAuditService.name)

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async record(record: CatalogAuditRecord): Promise<void> {
    try {
      await this.redis.xadd(
        CLICKER_CATALOG_AUDIT_STREAM,
        'MAXLEN',
        '~',
        CLICKER_CATALOG_AUDIT_MAXLEN,
        '*',
        'ts',
        new Date().toISOString(),
        'admin_id',
        record.adminId ?? 'unknown',
        'admin_email',
        record.adminEmail ?? 'unknown',
        'entity',
        record.entity,
        'action',
        record.action,
        'params',
        this.stringify(record.params),
        'body',
        this.stringify(record.body),
        'result',
        this.stringify(record.result),
      )
    } catch (err) {
      this.logger.warn(
        `catalog audit write failed: ${err instanceof Error ? err.message : err}`,
      )
    }
  }

  private stringify(value: unknown): string {
    if (value == null) return ''
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
}
