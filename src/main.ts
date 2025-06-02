import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import * as dotenv from 'dotenv'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import Stripe from 'stripe'
import { Logger } from '@nestjs/common'

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
      origin: [
        'https://droplock-frontend.vercel.app',
        'https://rabbit-frontend-jet.vercel.app',
        process.env.FRONTEND_URL || 'http://localhost:3000',
      ],
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
      credentials: true,
    })

    // app.setGlobalPrefix('api/v1')

    await app.listen(port, () => {
      logger.log(`Server is running on ${baseUrl}`)
    })

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
