import { Injectable, Logger } from '@nestjs/common'
import { DataSource } from 'typeorm'

/**
 * Singleton service for managing database connections
 * Prevents multiple connection pools from being created
 */
@Injectable()
export class ConnectionManager {
  private static instance: ConnectionManager
  private dataSource: DataSource | null = null
  private readonly logger = new Logger(ConnectionManager.name)

  private constructor() {}

  static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager()
    }
    return ConnectionManager.instance
  }

  setDataSource(dataSource: DataSource): void {
    if (this.dataSource && this.dataSource.isInitialized) {
      this.logger.warn('DataSource already initialized, skipping...')
      return
    }
    this.dataSource = dataSource
    this.logger.log('DataSource set successfully')
  }

  getDataSource(): DataSource | null {
    return this.dataSource
  }

  async isConnected(): Promise<boolean> {
    if (!this.dataSource) {
      return false
    }
    return this.dataSource.isInitialized
  }

  async closeConnection(): Promise<void> {
    if (this.dataSource && this.dataSource.isInitialized) {
      try {
        await this.dataSource.destroy()
        this.logger.log('Database connection closed successfully')
      } catch (error) {
        this.logger.error('Error closing database connection:', error)
      }
    }
  }

  async getConnectionCount(): Promise<number> {
    if (!this.dataSource || !this.dataSource.isInitialized) {
      return 0
    }

    try {
      // Get connection count from PostgreSQL
      const result = await this.dataSource.query(
        'SELECT count(*) as connection_count FROM pg_stat_activity WHERE application_name = $1',
        ['droplock-backend'],
      )
      return parseInt(result[0]?.connection_count || '0', 10)
    } catch (error) {
      this.logger.error('Error getting connection count:', error)
      return 0
    }
  }
}
