import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ERROR_MESSAGES } from '../../constants/errorMessages'

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  MODERATOR = 'moderator',
}

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name)

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    try {
      const requiredRoles = this.reflector.get<UserRole[]>(
        'roles',
        context.getHandler(),
      )
      if (!requiredRoles || requiredRoles.length === 0) {
        return true
      }

      const request = context.switchToHttp().getRequest()
      const user = request.user

      if (!user) {
        this.logger.warn(`Unauthorized access attempt`)
        throw new ForbiddenException(ERROR_MESSAGES.AUTH.NOT_AUTHENTICATED)
      }

      const hasRole = requiredRoles.includes(user.role)
      if (!hasRole) {
        this.logger.warn(
          `Access denied for user ${user.id} with role ${user.role}`,
        )
        throw new ForbiddenException(ERROR_MESSAGES.AUTH.ACCESS_DENIED)
      }

      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      this.logger.error(`Error in RolesGuard: ${message}`)
      throw error
    }
  }
}
