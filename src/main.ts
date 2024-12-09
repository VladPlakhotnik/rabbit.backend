import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { ConfigService } from '@nestjs/config'
const stripe = require('stripe')(
  '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',
)

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  const configService = app.get(ConfigService)
  const port = configService.get<number>('PORT') || 5000

  app.enableCors({
    origin: [
      'http://localhost:3000',
      'https://droplock-frontend.vercel.app',
      'https://droplock-frontend.onrender.com',
    ],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  })

  await app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`)
  })
}
bootstrap()
