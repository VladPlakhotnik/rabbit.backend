import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ConfigModule } from '@nestjs/config'

@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false, // Позволяет подключение к серверу с самоподписанным сертификатом
      },
      autoLoadEntities: true, // Автоматическая загрузка сущностей
      synchronize: false, // Только для разработки. На production отключите!
    }),
  ],
})
export class DatabaseModule {}
