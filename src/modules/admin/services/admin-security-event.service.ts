import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { FindOptionsWhere, ILike, Repository } from 'typeorm'
import { sanitizeAuditPayload } from '../../../core/audit/catalog-audit.service'
import {
  AdminSecurityEvent,
  AdminSecurityEventType,
} from '../entities/admin-security-event.entity'

interface RecordSecurityEventInput {
  adminEmail?: string | null
  adminId?: string | null
  ip?: string | null
  metadata?: Record<string, unknown>
  type: AdminSecurityEventType
  userAgent?: string | null
}

interface ListSecurityEventsInput {
  adminId?: string
  limit?: number
  page?: number
  search?: string
  type?: AdminSecurityEventType
}

@Injectable()
export class AdminSecurityEventService {
  private readonly logger = new Logger(AdminSecurityEventService.name)

  constructor(
    @InjectRepository(AdminSecurityEvent)
    private readonly events: Repository<AdminSecurityEvent>,
  ) {}

  async record(input: RecordSecurityEventInput): Promise<void> {
    try {
      await this.events.save(
        this.events.create({
          admin_id: input.adminId ?? null,
          admin_email: input.adminEmail ?? null,
          type: input.type,
          ip_address: input.ip ?? null,
          user_agent: input.userAgent ?? null,
          metadata: sanitizeAuditPayload(input.metadata ?? {}) as Record<
            string,
            unknown
          >,
        }),
      )
    } catch (error) {
      this.logger.warn(
        `admin security event write failed: ${
          error instanceof Error ? error.message : error
        }`,
      )
    }
  }

  async list(input: ListSecurityEventsInput = {}) {
    const page = Math.max(1, input.page ?? 1)
    const limit = Math.min(100, Math.max(1, input.limit ?? 25))
    const where: FindOptionsWhere<AdminSecurityEvent>[] = []
    const base: FindOptionsWhere<AdminSecurityEvent> = {}

    if (input.adminId) base.admin_id = input.adminId
    if (input.type) base.type = input.type

    const search = input.search?.trim()
    if (search) {
      where.push({ ...base, admin_email: ILike(`%${search}%`) })
      where.push({ ...base, ip_address: ILike(`%${search}%`) })
    }

    const [items, total] = await this.events.findAndCount({
      where: where.length ? where : base,
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    })

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    }
  }

  listForAdmin(adminId: string, limit = 25) {
    return this.list({ adminId, limit, page: 1 })
  }
}

