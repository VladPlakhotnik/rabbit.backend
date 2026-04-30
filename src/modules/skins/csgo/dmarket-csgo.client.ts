import { Injectable, Logger, Inject } from '@nestjs/common'
import axios, { AxiosResponse } from 'axios'
import {
  DMarketConfig,
  CS2_GAME_ID,
  USD_CURRENCY,
} from '../config/skin-sync.config'
import {
  DMarketApiResponse,
  DMarketSkinInfo,
} from '../types/dmarket.types'
import { RateLimiterService } from '../services/rate-limiter.service'
import { RetryService } from '../services/retry.service'
import {
  signDMarketRequest,
  observeRateLimitHeaders,
} from '../shared/dmarket-signer'
import { DMARKET_HTTPS_AGENT } from '../shared/http-agent'

// DMarket secondary client — used as METADATA enrichment only.
//
// In the new architecture market.csgo.com is the source of truth: a
// skin lives in DB iff it's in the bulk price feed. DMarket fills in
// fields the price feed doesn't carry (image, exterior, category,
// item_type, collection, name_color, etc.). We never create a row from
// DMarket data alone — if the price feed doesn't know about a skin,
// neither do we.
//
// What used to be a 1000-line god-service got split:
//   - this file: HTTP + auth + page-walk
//   - csgo-sync.service.ts: orchestration, upsert, status transitions

@Injectable()
export class DmarketCsgoClient {
  private readonly logger = new Logger(DmarketCsgoClient.name)
  private static readonly TIMEOUT_MS = 30_000

  constructor(
    @Inject('DMARKET_CONFIG') private readonly config: DMarketConfig,
    private readonly rateLimiter: RateLimiterService,
    private readonly retry: RetryService,
  ) {}

  // ---- Catalog walk -------------------------------------------------

  // orderDir=desc — empirical: on the live CS2 catalog the cheap end
  // is dominated by stickers / graffiti / capsules with dozens of
  // listings each, so a `?orderDir=asc` walk pulled ~4 unique items
  // per 100-row page (96% duplicate listings). The expensive end has
  // fewer high-volume sellers per skin and gives a noticeably better
  // unique-per-page ratio, which shortens the walk before the early-
  // exit (`seen.size === existingByName.size`) trips.
  private buildPath(extraQuery: string): string {
    const base =
      `/exchange/v1/market/items` +
      `?gameId=${CS2_GAME_ID}` +
      `&limit=${this.config.batchSize}` +
      `&orderBy=price&orderDir=desc` +
      `&currency=${USD_CURRENCY}`
    return extraQuery ? `${base}&${extraQuery}` : base
  }

  // Common request runner — both `fetchPage` (cursor) and
  // `fetchPageByOffset` route through here so they share the
  // rate-limiter, signing, retry and keep-alive plumbing.
  private async fetchOnce(
    path: string,
    operationName: string,
  ): Promise<DMarketApiResponse> {
    return this.retry.executeWithRetry(
      async () => {
        await this.rateLimiter.waitForRateLimit()

        this.logger.debug(`GET ${path}`)

        const response: AxiosResponse<DMarketApiResponse> = await axios.get(
          `${this.config.baseUrl}${path}`,
          {
            headers: signDMarketRequest({
              method: 'GET',
              pathWithQuery: path,
              publicKeyHex: this.config.apiKey,
              secretKeyHex: this.config.secretKey,
            }),
            timeout: DmarketCsgoClient.TIMEOUT_MS,
            // Reuse a TLS connection across requests — see
            // shared/http-agent.ts for the rationale.
            httpsAgent: DMARKET_HTTPS_AGENT,
          },
        )

        // First successful page: dump rate-limit headers so the
        // operator sees what bucket DMarket put us in. Quiet from the
        // second page onward.
        observeRateLimitHeaders('csgo', response.headers, (msg) =>
          this.logger.log(msg),
        )

        if (!response.data?.objects) {
          return { objects: [], cursor: null }
        }

        return response.data
      },
      this.config.retryAttempts,
      this.config.retryDelay,
      operationName,
    )
  }

  /**
   * Cursor-based fetch — DMarket's only reliable pagination for this
   * endpoint. We tried `?offset=N` for parallel workers and it failed
   * two ways: (1) DMarket caps offset around ~5100 with HTTP 400, and
   * (2) offset doesn't combine cleanly with `orderBy=price&orderDir=desc`
   * — concurrent calls at different offsets returned almost identical
   * item sets, presumably because the underlying offset implementation
   * uses a session-cached result rather than a stable price-sorted
   * window. Cursor pagination doesn't have these issues but is
   * inherently sequential (cursor N+1 is opaque and only revealed in
   * response N).
   */
  async fetchPage(cursor?: string): Promise<DMarketApiResponse> {
    const path = this.buildPath(
      cursor ? `cursor=${encodeURIComponent(cursor)}` : '',
    )
    return this.fetchOnce(path, 'DMarket catalog page')
  }

  // Walk the full catalog and return everything. Used for the
  // (relatively rare) full metadata refresh — typical sync only walks
  // until it has covered all known hash_names from the price feed.
  async fetchAll(): Promise<DMarketSkinInfo[]> {
    const all: DMarketSkinInfo[] = []
    let cursor: string | null = null
    let pageCount = 0
    const startedAt = Date.now()

    do {
      pageCount++

      const page = await this.fetchPage(cursor || undefined)

      if (!page.objects?.length) {
        this.logger.log('DMarket returned empty page, stopping walk')
        break
      }

      all.push(...page.objects)
      cursor = page.cursor
    } while (cursor)

    const elapsedSec = Math.ceil((Date.now() - startedAt) / 1000)
    this.logger.log(
      `Walked ${pageCount} pages, collected ${all.length} items in ${elapsedSec}s`,
    )

    return all
  }
}
