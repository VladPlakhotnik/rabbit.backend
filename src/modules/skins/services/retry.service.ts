import { Injectable, Logger } from '@nestjs/common'

@Injectable()
export class RetryService {
  private readonly logger = new Logger(RetryService.name)

  /**
   * Executes a function with retry logic
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxAttempts: number = 3,
    delay: number = 1000,
    operationName: string = 'operation',
  ): Promise<T> {
    let lastError: Error

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        if (attempt === maxAttempts) {
          this.logger.error(
            `${operationName} failed after ${maxAttempts} attempts:`,
            lastError.message,
          )
          throw lastError
        }

        this.logger.warn(
          `${operationName} failed (attempt ${attempt}/${maxAttempts}): ${lastError.message}. Retrying in ${delay}ms...`,
        )

        await this.delay(delay * attempt) // Exponential backoff
      }
    }

    throw lastError!
  }

  /**
   * Utility method for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
