import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Observable, tap } from 'rxjs'
import {
  ADMIN_MUTATION_AUDIT_META,
  AdminMutationAuditOptions,
} from '../decorators/admin-mutation.decorator'
import { CatalogAuditService } from '../../../core/audit/catalog-audit.service'
import { Admin } from '../entities/admin.entity'

interface RequestWithAdmin {
  user?: Admin
  params?: unknown
  body?: unknown
}

@Injectable()
export class AdminMutationAuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: CatalogAuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const audit = this.reflector.getAllAndOverride<AdminMutationAuditOptions>(
      ADMIN_MUTATION_AUDIT_META,
      [context.getHandler(), context.getClass()],
    )
    if (!audit) return next.handle()

    const req = context.switchToHttp().getRequest<RequestWithAdmin>()
    const admin = req.user
    return next.handle().pipe(
      tap(result => {
        void this.auditService.record({
          adminId: admin?.id ?? null,
          adminEmail: admin?.email ?? null,
          entity: audit.entity,
          action: audit.action,
          params: req.params,
          body: req.body,
          result,
        })
      }),
    )
  }
}
