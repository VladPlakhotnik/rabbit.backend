import { Module, OnModuleInit } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ConfigModule } from '@nestjs/config'
import { ConnectionManager } from './connection-manager'
import { DataSource } from 'typeorm'

/**
 * Module for setting up a database connection.
 *
 * Hosted PostgreSQL deployments (AWS RDS / managed providers) usually impose a
 * per-role `CONNECTION LIMIT`. The previous configuration combined a pool that
 * was reluctant to release sockets (`keepConnectionAlive: true`,
 * `keepAlive: true`, `allowExitOnIdle: false`, `min: 1`) with a database-backed
 * query cache that consumed an extra slot — a single dev restart leaked
 * connections that lingered until the host evicted them, eventually starving
 * everything else (pgAdmin, parallel processes) under the same role.
 *
 * The new configuration is "release-eagerly": pool size of 1..3, idle sockets
 * closed after 5s, no OS-level TCP keep-alive, no `keepConnectionAlive` (Nest
 * keeps the DataSource — we don't need an extra layer holding sockets), and
 * an in-memory query cache (so the cache doesn't burn connections).
 *
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
        rejectUnauthorized: false,
      },
      autoLoadEntities: true,
      synchronize: false,
      retryAttempts: 3,
      retryDelay: 3000,
      // Pool tuned for a managed Postgres with a low per-role CONNECTION LIMIT.
      // Keep the footprint as small as possible and release sockets quickly so
      // pgAdmin / parallel tools can connect under the same role.
      extra: {
        max: 3,
        // Important: 0 means the pool can fully drain when idle. Setting this
        // to 1+ keeps a dedicated socket open forever per running process and
        // is the main reason "too many connections" recurred after dev restarts.
        min: 0,
        // Aggressively reap idle sockets — within 5s of being unused.
        idleTimeoutMillis: 5000,
        connectionTimeoutMillis: 10000,
        acquireTimeoutMillis: 15000,
        // Cycle each connection after a fixed number of uses so a leaked
        // server-side state on one socket can't poison the whole pool.
        maxUses: 7500,
        reapIntervalMillis: 1000,
        application_name: 'droplock-backend',
        // Statement-level safety net so a runaway query can't park a connection
        // for hours on the server.
        statement_timeout: 30000,
        query_timeout: 30000,
      },
      connectTimeoutMS: 15000,
      logging: false,
      // Was `true`. Combined with `min: 1` + `keepAlive: true` it kept sockets
      // alive across reloads and made connection leaks effectively permanent.
      keepConnectionAlive: false,
      // In-memory cache instead of `type: 'database'`. The DB-backed variant
      // dedicated an extra connection slot for cache I/O, doubling the impact
      // of every restart on the per-role connection limit.
      cache: false,
    }),
  ],
})
export class DatabaseModule implements OnModuleInit {
  constructor(private dataSource: DataSource) {}

  async onModuleInit() {
    const connectionManager = ConnectionManager.getInstance()
    connectionManager.setDataSource(this.dataSource)

    const connectionCount = await connectionManager.getConnectionCount()
    // eslint-disable-next-line no-console
    console.log(
      `Database module initialized. Active connections: ${connectionCount}`,
    )
  }
}
