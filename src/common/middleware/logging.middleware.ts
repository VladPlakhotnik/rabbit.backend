import { Injectable, NestMiddleware, Logger } from '@nestjs/common'
import { Request, Response, NextFunction } from 'express'
import { maskAuthHeader } from '../helpers/mask-token'

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP')

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl } = req
    const authHeader = req.headers.authorization
    const origin = req.headers.origin

    this.logger.log(
      `${method} ${originalUrl} | Origin: ${origin || 'none'} | Auth: ${maskAuthHeader(authHeader)}`,
    )

    res.on('finish', () => {
      const { statusCode } = res
      this.logger.log(
        `${method} ${originalUrl} ${statusCode} | Auth: ${
          authHeader ? 'present' : 'missing'
        }`,
      )
    })

    next()
  }
}
