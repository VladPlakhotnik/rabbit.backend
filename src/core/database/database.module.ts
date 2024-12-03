import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule, ConfigService } from "@nestjs/config";

@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: "postgres",
        url: configService.get<string>("DATABASE_URL"),
        ssl: {
          rejectUnauthorized: false, // Позволяет подключение к серверу с самоподписанным сертификатом
        },
        autoLoadEntities: true, // Автоматическая загрузка сущностей
        synchronize: false, // Только для разработки. На production отключите!
      }),
    }),
  ],
})
export class DatabaseModule {}
