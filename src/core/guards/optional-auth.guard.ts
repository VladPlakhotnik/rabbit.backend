import { Injectable, ExecutionContext } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'

@Injectable()
export class OptionalAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    // Не выбрасываем ошибку, если пользователь не аутентифицирован
    // Просто возвращаем пользователя или null
    return user || null
  }
}
