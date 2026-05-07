// MUST be first — populates process.env before any other module reads it
// at import time (CORS allowlist, gateway config, etc.).
import './core/config/load-env'
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import Stripe from 'stripe'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { Logger, ValidationPipe } from '@nestjs/common'
import { ConnectionManager } from './core/database/connection-manager'
import { getCorsOrigins } from './core/config/cors'
import { validateEnv } from './core/config/validate-env'

// Crash early on a misconfigured environment. Better than serving 500s
// on the first request that needs the missing variable.
validateEnv()

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '')
const logger = new Logger('Bootstrap')

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule)

    // Tell Nest to listen for SIGINT/SIGTERM and run lifecycle hooks
    // (`OnModuleDestroy`, `OnApplicationShutdown`). Without this, Ctrl+C in
    // dev exits immediately without draining the TypeORM pool — leaked
    // connections then sit `idle` on the managed Postgres server until the
    // host evicts them, eating into the per-role connection limit.
    app.enableShutdownHooks()

    const port = parseInt(process.env.PORT || '5000', 10)
    if (isNaN(port)) {
      logger.error('Invalid PORT value')
      process.exit(1)
    }
    const baseUrl = process.env.BASE_URL || `http://localhost:${port}`
    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      logger.error('BASE_URL must include protocol (http:// or https://)')
      process.exit(1)
    }

    const config = new DocumentBuilder()
      .setTitle('API')
      .setDescription('The API documentation')
      .setVersion('1.0')
      .addBearerAuth()
      .build()

    const document = SwaggerModule.createDocument(app, config)
    SwaggerModule.setup('api', app, document)

    // Sets a baseline of security headers on every response. CSP is left to
    // the SPA frontend (different origin), and crossOriginEmbedderPolicy is
    // off so Swagger UI keeps loading its bundled assets.
    app.use(
      helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
      }),
    )

    // Required by the admin auth flow — refresh tokens travel as
    // HttpOnly cookies on /admin/auth/{refresh,logout}. Plain bodies
    // and headers don't need this.
    app.use(cookieParser())

    // Reject unknown fields, instantiate DTO classes from JSON bodies, surface
    // class-validator errors as 400. Modules that haven't migrated to
    // decorator-based DTOs keep working — they just don't get the extra checks.
    //
    // `enableImplicitConversion` is intentionally OFF: with it on, missing
    // query params like `?page=` arrive as `NaN` (because `Number(undefined)`
    // is `NaN`), which silently breaks endpoints that rely on TS default
    // values like `page: number = 1`. Per-endpoint conversion via
    // `@Type(() => Number)` on a query DTO is the recommended pattern when
    // numeric coercion is actually wanted.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )

    // Origin is locked to the env-driven allowlist (see core/config/cors.ts).
    // Methods / headers / exposed-headers MUST be explicit lists — when
    // `credentials: true` the browser treats `*` as a LITERAL header name
    // ("there's a header literally called *"), which means Content-Type,
    // Authorization, etc. all get rejected by the preflight. The earlier
    // `allowedHeaders: '*'` fix only worked for non-credentialed requests.
    const corsOrigins = getCorsOrigins()
    logger.log(`CORS allowlist: ${corsOrigins.join(', ')}`)
    app.enableCors({
      origin: corsOrigins,
      credentials: true,
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'Accept',
        'Origin',
        'X-Requested-With',
        'X-Forwarded-For',
        'X-Real-IP',
        // Used by clicker buy/activate/open-case so browser retries
        // cannot double-spend. Must be explicitly allowed because
        // credentialed CORS preflight rejects wildcard headers.
        'Idempotency-Key',
        'X-Idempotency-Key',
      ],
      exposedHeaders: ['Content-Disposition', 'X-Total-Count'],
      preflightContinue: false,
      optionsSuccessStatus: 204,
    })

    // app.setGlobalPrefix('api/v1')

    await app.listen(port, () => {
      logger.log(`Server is running on ${baseUrl}`)
    })

    // Belt-and-suspenders: even with `enableShutdownHooks`, `nodemon` /
    // `ts-node-dev` sometimes deliver a second SIGTERM before Nest finishes
    // closing. Closing the DataSource explicitly here drains the pool so
    // sockets get a proper FIN before the process dies.
    const gracefulShutdown = async (signal: string): Promise<void> => {
      logger.log(`Received ${signal}, closing app...`)
      try {
        await app.close()
        await ConnectionManager.getInstance().closeConnection()
        logger.log('Shutdown complete')
        process.exit(0)
      } catch (error) {
        logger.error('Error during graceful shutdown', error)
        process.exit(1)
      }
    }

    process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'))
    process.on('SIGINT', () => void gracefulShutdown('SIGINT'))
  } catch (error) {
    logger.error('Failed to start application:', error)
    process.exit(1)
  }
}
bootstrap()
