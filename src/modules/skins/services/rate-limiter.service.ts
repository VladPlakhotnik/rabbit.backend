import { Injectable, Logger, Inject } from '@nestjs/common'
import { DMarketConfig } from '../config/skin-sync.config'
import { RateLimitInfo } from '../types/dmarket.types'

@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger(RateLimiterService.name)
  private readonly config: DMarketConfig
  private requestTimestamps: number[] = []
  private lastRequestTime = 0

  // Tail of a promise chain that serialises concurrent waiters. Each
  // call to `waitForRateLimit` chains onto the previous one, so the
  // critical-section work (gap check, optional delay, timestamp push)
  // runs atomically with respect to other callers. Without this, four
  // parallel workers calling waitForRateLimit() simultaneously would
  // all read the same `lastRequestTime`, all skip the gap-wait, and
  // burst-fire requests past DMarket's per-second cap. The chain adds
  // one microtask of overhead per call — negligible compared to the
  // 60+ ms gap we're enforcing.
  private chain: Promise<void> = Promise.resolve()

  // Config comes from the DMARKET_CONFIG provider, which is built at
  // Nest bootstrap from env. No fallback default — a missing key has
  // already failed fast in buildDMarketConfig().
  constructor(@Inject('DMARKET_CONFIG') config: DMarketConfig) {
    this.config = config
  }

  /**
   * Waits for rate limit compliance before making a request. Safe
   * under concurrent callers — see the `chain` field.
   */
  async waitForRateLimit(): Promise<void> {
    const previous = this.chain
    let releaseChain: () => void = () => {}
    this.chain = new Promise<void>((resolve) => {
      releaseChain = resolve
    })

    // Wait for the previous waiter to finish its critical section.
    // Errors in earlier waiters never propagate via `chain` — we
    // always resolve in the `finally` below, never reject.
    await previous

    try {
      // Format the wait time for logs: ms when sub-second, otherwise
      // seconds. Avoids the previous "Waiting 0 seconds..." spam when
      // running on the small inter-request gaps that the trading-tier
      // limit allows (60 ms at 18 RPS).
      const formatWait = (ms: number): string =>
        ms < 1000 ? `${ms} ms` : `${Math.ceil(ms / 1000)} seconds`

      let now = Date.now()
      const oneMinuteAgo = now - 60000

      this.requestTimestamps = this.requestTimestamps.filter(
        (timestamp) => timestamp > oneMinuteAgo,
      )

      // Min gap between requests
      const timeSinceLastRequest = now - this.lastRequestTime
      if (timeSinceLastRequest < this.config.minDelayBetweenRequests) {
        const waitTime =
          this.config.minDelayBetweenRequests - timeSinceLastRequest
        this.logger.debug(
          `Minimum delay not met. Waiting ${formatWait(waitTime)}...`,
        )
        await this.delay(waitTime)
        now = Date.now()
      }

      // Per-minute cap
      if (this.requestTimestamps.length >= this.config.maxRequestsPerMinute) {
        const oldestRequest = Math.min(...this.requestTimestamps)
        // 250 ms buffer (was 1 s) — at high RPS the rolling window
        // empties within a few requests; a long fixed cushion meant
        // every cap-hit added almost a second of dead air.
        const waitTime = 60000 - (now - oldestRequest) + 250

        if (waitTime > 0) {
          this.logger.debug(
            `Rate limit reached. Waiting ${formatWait(waitTime)}...`,
          )
          await this.delay(waitTime)
          now = Date.now()
        }
      }

      // Record the actual emit time, not the entry time — keeps the
      // rolling window honest under heavy concurrency.
      this.requestTimestamps.push(now)
      this.lastRequestTime = now
    } finally {
      releaseChain()
    }
  }

  /**
   * Get current rate limit information
   */
  getRateLimitInfo(): RateLimitInfo {
    const now = Date.now()
    const oneMinuteAgo = now - 60000

    // Clean up old timestamps
    this.requestTimestamps = this.requestTimestamps.filter(
      (timestamp) => timestamp > oneMinuteAgo,
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
    this.chain = Promise.resolve()
  }

  /**
   * Utility method for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
