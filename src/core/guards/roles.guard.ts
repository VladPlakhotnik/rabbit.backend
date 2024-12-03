import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Получаем требуемые роли из метаданных
    const requiredRoles = this.reflector.get<string[]>(
      'roles',
      context.getHandler(),
    )
    if (!requiredRoles || requiredRoles.length === 0) {
      // Если роли не указаны, разрешаем доступ
      return true
    }

    const request = context.switchToHttp().getRequest()
    const user = request.user

    // Проверяем, авторизован ли пользователь
    if (!user) {
      throw new ForbiddenException('User not authenticated')
    }

    // Проверяем, есть ли у пользователя необходимая роль
    const hasRole = requiredRoles.includes(user.role)
    if (!hasRole) {
      throw new ForbiddenException('Access denied')
    }

    return true
  }
}
