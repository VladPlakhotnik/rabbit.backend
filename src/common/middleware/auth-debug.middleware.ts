import { Injectable, NestMiddleware, Logger } from '@nestjs/common'
import { Request, Response, NextFunction } from 'express'

@Injectable()
export class AuthDebugMiddleware implements NestMiddleware {
  private readonly logger = new Logger('AuthDebug')

  use(req: Request, res: Response, next: NextFunction) {
    if (req.url.includes('/users/me')) {
      this.logger.log('=== AUTH DEBUG ===')
      this.logger.log('URL:', req.url)
      this.logger.log('Method:', req.method)
      this.logger.log('Headers:', JSON.stringify(req.headers, null, 2))
      this.logger.log(
        'Authorization:',
        req.headers.authorization || 'NOT FOUND',
      )
      this.logger.log('===================')
    }
    next()
  }
}
