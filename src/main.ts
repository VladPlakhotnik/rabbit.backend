import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import * as dotenv from 'dotenv'

dotenv.config()

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  const port = process.env.PORT || 5000
  const baseUrl = process.env.BASE_URL || 'localhost'

  app.enableCors({
    origin: ['http://localhost:3000', 'https://droplock-frontend.vercel.app'],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  })

  await app.listen(port, () => {
    console.log(`Server is running on ${baseUrl}`)
  })
}
bootstrap()
