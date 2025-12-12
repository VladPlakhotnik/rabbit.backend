import { Injectable, NestMiddleware, Logger } from '@nestjs/common'
import { Request, Response, NextFunction } from 'express'

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP')

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl } = req
    const authHeader = req.headers.authorization
    const authHeaderLower =
      req.headers['authorization'] || req.headers['Authorization']
    const origin = req.headers.origin

    // Check all possible Authorization header variations
    const allHeaders = req.headers
    const authHeaderFound =
      allHeaders['authorization'] || allHeaders['Authorization'] || authHeader

    this.logger.log(
      `${method} ${originalUrl} | Origin: ${origin || 'none'} | Auth: ${
        authHeaderFound
          ? 'Found: ' + String(authHeaderFound).substring(0, 30) + '...'
          : 'Missing'
      }`,
    )

    // Check for lowercase authorization header
    if (!authHeader && originalUrl.includes('/users/me')) {
      this.logger.warn('Authorization header missing for /users/me request')
      this.logger.warn('Available headers:', Object.keys(allHeaders).join(', '))
      this.logger.warn('Raw headers exist:', (req as any).rawHeaders)
    }

    res.on('finish', () => {
      const { statusCode } = res
      this.logger.log(
        `${method} ${originalUrl} ${statusCode} | Auth: ${
          authHeader ? 'Present' : 'Missing'
        }`,
      )
    })

    next()
  }
}
