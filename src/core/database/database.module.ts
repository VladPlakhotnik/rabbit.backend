import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ConfigModule } from '@nestjs/config'

/**
 * Module for setting up a database connection
 * @module DatabaseModule
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      validate: config => {
        if (!config.DATABASE_URL) {
          throw new Error('DATABASE_URL is not defined')
        }
        return config
      },
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false, // Allows connection to a server with a self-signed certificate
      },
      autoLoadEntities: true, // Automatically load entities
      synchronize: false, // Only for development. Disable on production!
      retryAttempts: 3, // Number of retry attempts
      retryDelay: 3000, // Delay between retry attempts
    }),
  ],
})
export class DatabaseModule {}
