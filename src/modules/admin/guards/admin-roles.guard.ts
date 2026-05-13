import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ADMIN_ROLES_KEY } from '../decorators/admin-roles.decorator'
import { Admin } from '../entities/admin.entity'
import { AdminRole } from '../types/admin-role.enum'

// Reads the @AdminRoles() metadata and rejects if the request's admin
// (set by AdminJwtGuard → AdminJwtStrategy.validate) doesn't have one
// of the listed roles. No metadata = no role check (just auth).
@Injectable()
export class AdminRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AdminRole[]>(
      ADMIN_ROLES_KEY,
      [ctx.getHandler(), ctx.getClass()],
    )
    if (!required || required.length === 0) return true

    const req = ctx.switchToHttp().getRequest<{ user?: Admin }>()
    const admin = req.user
    if (!admin) {
      // Should be caught earlier by AdminJwtGuard — defense in depth.
      throw new ForbiddenException('Admin context missing')
    }
    if (!required.includes(admin.role)) {
      throw new ForbiddenException(
        `Insufficient role — requires one of [${required.join(', ')}]`,
      )
    }
    return true
  }
}
