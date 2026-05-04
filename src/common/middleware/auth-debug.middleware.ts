import { Injectable, NestMiddleware, Logger } from '@nestjs/common'
import { Request, Response, NextFunction } from 'express'
import { maskAuthHeader, redactHeaders } from '../helpers/mask-token'

// Diagnostic middleware for the /users/me path. Disabled by default —
// flip AUTH_DEBUG=1 in env when chasing a "why is my JWT not arriving"
// production issue. Even when enabled, the Authorization header and
// any cookies are redacted before being written to the log.

@Injectable()
export class AuthDebugMiddleware implements NestMiddleware {
  private readonly logger = new Logger('AuthDebug')
  private readonly enabled = process.env.AUTH_DEBUG === '1'

  use(req: Request, _res: Response, next: NextFunction) {
    if (!this.enabled) {
      next()
      return
    }
    if (req.url.includes('/users/me')) {
      this.logger.log(`${req.method} ${req.url}`)
      this.logger.log(`Headers: ${JSON.stringify(redactHeaders(req.headers))}`)
      this.logger.log(`Authorization: ${maskAuthHeader(req.headers.authorization)}`)
    }
    next()
  }
}
