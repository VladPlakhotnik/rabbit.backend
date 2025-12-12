import { Injectable, Logger, Inject, Optional } from '@nestjs/common'
import {
  DMarketConfig,
  DEFAULT_DMARKET_CONFIG,
} from '../config/skin-sync.config'
import { RateLimitInfo } from '../types/dmarket.types'

@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger(RateLimiterService.name)
  private readonly config: DMarketConfig
  private requestTimestamps: number[] = []
  private lastRequestTime = 0

  constructor(@Inject('DMARKET_CONFIG') @Optional() config?: DMarketConfig) {
    this.config = config || DEFAULT_DMARKET_CONFIG
  }

  /**
   * Waits for rate limit compliance before making a request
   */
  async waitForRateLimit(): Promise<void> {
    const now = Date.now()
    const oneMinuteAgo = now - 60000

    // Clean up old timestamps
    this.requestTimestamps = this.requestTimestamps.filter(
      timestamp => timestamp > oneMinuteAgo,
    )

    // Check minimum delay between requests
    const timeSinceLastRequest = now - this.lastRequestTime
    if (timeSinceLastRequest < this.config.minDelayBetweenRequests) {
      const waitTime =
        this.config.minDelayBetweenRequests - timeSinceLastRequest
      this.logger.debug(
        `Minimum delay not met. Waiting ${Math.ceil(
          waitTime / 1000,
        )} seconds...`,
      )
      await this.delay(waitTime)
    }

    // Check if we've exceeded the rate limit
    if (this.requestTimestamps.length >= this.config.maxRequestsPerMinute) {
      const oldestRequest = Math.min(...this.requestTimestamps)
      const waitTime = 60000 - (now - oldestRequest) + 1000 // Add 1 second buffer

      if (waitTime > 0) {
        this.logger.debug(
          `Rate limit reached. Waiting ${Math.ceil(
            waitTime / 1000,
          )} seconds...`,
        )
        await this.delay(waitTime)
      }
    }

    // Record this request timestamp
    this.requestTimestamps.push(now)
    this.lastRequestTime = now
  }

  /**
   * Get current rate limit information
   */
  getRateLimitInfo(): RateLimitInfo {
    const now = Date.now()
    const oneMinuteAgo = now - 60000

    // Clean up old timestamps
    this.requestTimestamps = this.requestTimestamps.filter(
      timestamp => timestamp > oneMinuteAgo,
    )

    return {
      maxRequestsPerMinute: this.config.maxRequestsPerMinute,
      requestsInLastMinute: this.requestTimestamps.length,
      requestDelay: this.config.requestDelay,
      minDelayBetweenRequests: this.config.minDelayBetweenRequests,
      timeSinceLastRequest: this.lastRequestTime
        ? now - this.lastRequestTime
        : 0,
    }
  }

  /**
   * Reset rate limiter state
   */
  reset(): void {
    this.requestTimestamps = []
    this.lastRequestTime = 0
  }

  /**
   * Utility method for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
