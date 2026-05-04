import { ExecutionContext, createParamDecorator } from '@nestjs/common'
import { Admin } from '../entities/admin.entity'

// Pulls the live Admin row off req.user (placed there by AdminJwtStrategy).
// Use in any controller that's behind AdminJwtGuard:
//
//   @Get('/me')
//   @UseGuards(AdminJwtGuard)
//   me(@CurrentAdmin() admin: Admin) { return admin.toSafeJson() }
export const CurrentAdmin = createParamDecorator((_: unknown, ctx: ExecutionContext): Admin => {
  const req = ctx.switchToHttp().getRequest<{ user: Admin }>()
  return req.user
})
