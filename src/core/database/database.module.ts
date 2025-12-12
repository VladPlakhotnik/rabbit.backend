import { Module, OnModuleInit } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ConfigModule } from '@nestjs/config'
import { ConnectionManager } from './connection-manager'
import { DataSource } from 'typeorm'

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
      // Connection pool configuration to prevent "too many connections" error
      extra: {
        // Pool configuration
        max: 3, // Maximum number of connections in the pool (reduced further)
        min: 1, // Minimum number of connections in the pool
        idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
        connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection could not be established
        maxUses: 10000, // Close (and replace) a connection after it has been used this many times
        acquireTimeoutMillis: 15000, // Maximum time to wait for a connection
        createTimeoutMillis: 15000, // Maximum time to create a connection
        destroyTimeoutMillis: 10000, // Maximum time to destroy a connection
        reapIntervalMillis: 2000, // How often to check for idle connections
        createRetryIntervalMillis: 500, // How long to wait before retrying connection creation

        // Pool management
        allowExitOnIdle: false, // Don't exit when pool is idle
        keepAlive: true, // Keep connections alive
        keepAliveInitialDelayMillis: 0, // Start keep-alive immediately

        // Connection reuse
        statement_timeout: 30000, // 30 seconds statement timeout
        query_timeout: 30000, // 30 seconds query timeout
        application_name: 'droplock-backend', // Application name for connection identification
      },
      // Connection options
      connectTimeoutMS: 15000, // Give up initial connection after 15 seconds
      logging: false, // Disable logging to reduce overhead
      // Keep connection alive
      keepConnectionAlive: true,
      // Cache prepared statements
      cache: {
        type: 'database',
        tableName: 'query_result_cache',
        duration: 30000, // 30 seconds cache duration
      },
    }),
  ],
})
export class DatabaseModule implements OnModuleInit {
  constructor(private dataSource: DataSource) {}

  async onModuleInit() {
    // Set the DataSource in ConnectionManager singleton
    const connectionManager = ConnectionManager.getInstance()
    connectionManager.setDataSource(this.dataSource)

    // Log connection information
    const connectionCount = await connectionManager.getConnectionCount()
    console.log(
      `Database module initialized. Active connections: ${connectionCount}`,
    )
  }
}
