import { Inject, Injectable, Logger } from '@nestjs/common'
import Redis from 'ioredis'
import { REDIS_CLIENT } from '../redis/redis.constants'

const CLICKER_CATALOG_AUDIT_STREAM = 'clicker:admin:catalog:audit'
const CLICKER_CATALOG_AUDIT_MAXLEN = 10_000
const REDACTED = '[redacted]'
const MAX_AUDIT_STRING_LENGTH = 2_000

const SENSITIVE_KEY_PATTERN =
  /(password|passcode|totp|token|secret|private[_-]?key|authorization|cookie|webhook[_-]?secret|token[_-]?hash)/i

export interface CatalogAuditRecord {
  adminId?: string | null
  adminEmail?: string | null
  entity: string
  action: string
  params?: unknown
  body?: unknown
  result?: unknown
}

export interface CatalogAuditLogEntry {
  id: string
  ts: string | null
  admin_id: string | null
  admin_email: string | null
  entity: string | null
  action: string | null
  params: unknown
  body: unknown
  result: unknown
}

export function sanitizeAuditPayload(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') {
    return value.length > MAX_AUDIT_STRING_LENGTH
      ? `${value.slice(0, MAX_AUDIT_STRING_LENGTH)}...`
      : value
  }
  if (typeof value !== 'object') return value
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(item => sanitizeAuditPayload(item))

  const output: Record<string, unknown> = {}
  for (const [key, nestedValue] of Object.entries(value)) {
    output[key] = SENSITIVE_KEY_PATTERN.test(key)
      ? REDACTED
      : sanitizeAuditPayload(nestedValue)
  }
  return output
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
        this.stringify(sanitizeAuditPayload(record.params)),
        'body',
        this.stringify(sanitizeAuditPayload(record.body)),
        'result',
        this.stringify(sanitizeAuditPayload(record.result)),
      )
    } catch (err) {
      this.logger.warn(
        `catalog audit write failed: ${err instanceof Error ? err.message : err}`,
      )
    }
  }

  async list(limit = 50): Promise<{ items: CatalogAuditLogEntry[] }> {
    const safeLimit = Math.min(100, Math.max(1, limit))
    try {
      const rows = await this.redis.xrevrange(
        CLICKER_CATALOG_AUDIT_STREAM,
        '+',
        '-',
        'COUNT',
        safeLimit,
      )

      return {
        items: rows.map(([id, fields]) => this.parseStreamEntry(id, fields)),
      }
    } catch (err) {
      this.logger.warn(
        `catalog audit read failed: ${err instanceof Error ? err.message : err}`,
      )
      return { items: [] }
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

  private parseStreamEntry(id: string, fields: string[]): CatalogAuditLogEntry {
    const record: Record<string, string> = {}
    for (let index = 0; index < fields.length; index += 2) {
      const key = fields[index]
      if (!key) continue
      record[key] = fields[index + 1] ?? ''
    }

    return {
      id,
      ts: record.ts || null,
      admin_id: record.admin_id || null,
      admin_email: record.admin_email || null,
      entity: record.entity || null,
      action: record.action || null,
      params: this.parseJson(record.params),
      body: this.parseJson(record.body),
      result: this.parseJson(record.result),
    }
  }

  private parseJson(value: string | undefined): unknown {
    if (!value) return null
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
}
