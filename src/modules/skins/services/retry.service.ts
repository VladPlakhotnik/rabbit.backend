import { Injectable, Logger } from '@nestjs/common'

// Caps the wait we'll honor from a server-supplied `Retry-After`.
// DMarket isn't documented to send minute-long values, but a buggy
// header (or one with an HTTP-date far in the future) shouldn't be
// able to stall a sync indefinitely — we'd rather fail fast and let
// the caller decide.
const MAX_RETRY_AFTER_MS = 60_000

// Floor for the exponential backoff when the server doesn't tell us
// how long to wait. 429 with no Retry-After: pause longer than the
// nominal request delay so we genuinely back off, not just re-fire
// against a still-saturated bucket.
const MIN_RATE_LIMIT_BACKOFF_MS = 2_000

interface AxiosLikeError {
  response?: {
    status?: number
    headers?: Record<string, unknown>
  }
}

const isRateLimitError = (err: unknown): err is AxiosLikeError =>
  typeof err === 'object' &&
  err !== null &&
  'response' in err &&
  (err as AxiosLikeError).response?.status === 429

// Parse a `Retry-After` header into milliseconds. The HTTP spec allows
// either delta-seconds (integer) or an HTTP-date. We accept both;
// anything we can't parse → undefined and the caller falls back to
// exponential backoff.
const parseRetryAfter = (raw: unknown): number | undefined => {
  if (raw === undefined || raw === null) return undefined

  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string' && typeof value !== 'number') return undefined

  const asString = String(value).trim()
  if (asString === '') return undefined

  const seconds = Number.parseInt(asString, 10)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS)
  }

  const dateMs = Date.parse(asString)
  if (Number.isFinite(dateMs)) {
    const delta = dateMs - Date.now()
    if (delta <= 0) return 0
    return Math.min(delta, MAX_RETRY_AFTER_MS)
  }

  return undefined
}

@Injectable()
export class RetryService {
  private readonly logger = new Logger(RetryService.name)

  /**
   * Executes a function with retry logic. 429 responses are handled
   * specially: we read `Retry-After` from the response and wait that
   * long instead of the standard exponential delay, and the attempt
   * doesn't count against `maxAttempts` for the *first* 429 — a single
   * rate-limit hit shouldn't burn a real retry budget intended for
   * transient 5xx / network errors.
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxAttempts: number = 3,
    delay: number = 1000,
    operationName: string = 'operation',
  ): Promise<T> {
    let lastError: Error
    let attempt = 0
    let rateLimitForgiven = false

    while (attempt < maxAttempts) {
      attempt++
      try {
        return await operation()
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        if (isRateLimitError(error)) {
          const headers = error.response?.headers ?? {}
          const retryAfterMs =
            parseRetryAfter(headers['retry-after']) ??
            parseRetryAfter(headers['Retry-After'])
          const waitMs =
            retryAfterMs !== undefined
              ? Math.max(retryAfterMs, 0)
              : Math.max(delay * attempt, MIN_RATE_LIMIT_BACKOFF_MS)

          this.logger.warn(
            `${operationName} hit 429${
              retryAfterMs !== undefined ? ` (Retry-After: ${retryAfterMs}ms)` : ''
            } — waiting ${waitMs}ms before retry`,
          )

          await this.delay(waitMs)

          // Forgive exactly one 429 across the lifetime of this call.
          // Subsequent 429s do count against maxAttempts: if rate-limit
          // is sustained, something's wrong with our config and we
          // should surface it rather than spin silently.
          if (!rateLimitForgiven) {
            rateLimitForgiven = true
            attempt--
          }
          continue
        }

        if (attempt === maxAttempts) {
          this.logger.error(
            `${operationName} failed after ${maxAttempts} attempts:`,
            lastError.message,
          )
          throw lastError
        }

        this.logger.warn(
          `${operationName} failed (attempt ${attempt}/${maxAttempts}): ${lastError.message}. Retrying in ${delay * attempt}ms...`,
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
