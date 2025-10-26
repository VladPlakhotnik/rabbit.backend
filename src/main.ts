import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import * as dotenv from 'dotenv'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import Stripe from 'stripe'
import { Logger } from '@nestjs/common'
import { ConnectionManager } from './core/database/connection-manager'
import { json, urlencoded } from 'express'

dotenv.config()

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '')
const logger = new Logger('Bootstrap')

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule)

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

    app.enableCors({
      origin: true, // Allow all origins for now to debug
      methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
      credentials: true,
      allowedHeaders: '*', // Allow all headers to debug
      exposedHeaders: ['Authorization', 'authorization'],
    })

    app.use(json())
    app.use(urlencoded({ extended: true }))

    // app.setGlobalPrefix('api/v1')

    await app.listen(port, () => {
      logger.log(`Server is running on ${baseUrl}`)
    })

    // Graceful shutdown handling
    const gracefulShutdown = async (signal: string) => {
      logger.log(`Received ${signal}. Starting graceful shutdown...`)
      try {
        // Get connection count before closing
        const connectionManager = ConnectionManager.getInstance()
        const connectionCount = await connectionManager.getConnectionCount()
        logger.log(`Active connections before shutdown: ${connectionCount}`)

        // Close the application and all connections
        await app.close()

        // Close database connections explicitly
        await connectionManager.closeConnection()

        // Give some time for connections to close properly
        await new Promise(resolve => setTimeout(resolve, 2000))

        logger.log('Application closed successfully')
        process.exit(0)
      } catch (error) {
        logger.error('Error during graceful shutdown:', error)
        process.exit(1)
      }
    }

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
    process.on('SIGINT', () => gracefulShutdown('SIGINT'))

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason)
    })

    process.on('uncaughtException', error => {
      logger.error('Uncaught Exception:', error)
      process.exit(1)
    })
  } catch (error) {
    logger.error('Failed to start application:', error)
    process.exit(1)
  }
}
bootstrap()
