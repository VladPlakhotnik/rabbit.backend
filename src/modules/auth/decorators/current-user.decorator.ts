import { ExecutionContext, createParamDecorator } from '@nestjs/common'
import { User } from '../../users/user.entity'

// Pulls the live User row off req.user (placed there by JwtStrategy).
// Use in any controller that's behind AuthGuard('jwt'):
//
//   @Get('/me')
//   @UseGuards(AuthGuard('jwt'))
//   me(@CurrentUser() user: User) { return user }
//
// Parity with @CurrentAdmin from modules/admin — keep them separate
// so type information (User vs Admin) doesn't get mixed up at the
// call site.
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): User => {
    const req = ctx.switchToHttp().getRequest<{ user: User }>()
    return req.user
  },
)
