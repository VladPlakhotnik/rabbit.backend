import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { ConfigService } from '@nestjs/config'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  const configService = app.get(ConfigService)
  const port = configService.get<number>('PORT') || 5000

  // // Включаем CORS, если нужно
  // app.enableCors()

  await app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`)
  })
}
bootstrap()
