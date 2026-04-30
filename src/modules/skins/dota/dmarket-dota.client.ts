import { Injectable, Logger, Inject } from '@nestjs/common'
import axios, { AxiosResponse } from 'axios'
import {
  DMarketConfig,
  DOTA2_GAME_ID,
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

// Dota 2 sibling of DmarketCsgoClient. Identical mechanics — the only
// substantive difference is the gameId (`9a92` vs CS's `a8db`).
//
// Could in principle merge with DmarketCsgoClient and parameterise on
// gameId, but kept separate so future game-specific tweaks (Dota's
// `extra` payload has fields CS doesn't, e.g. `hero`) don't bleed
// across modules. Cost is ~80 lines of duplication; benefit is clean
// per-game evolution.

@Injectable()
export class DmarketDotaClient {
  private readonly logger = new Logger(DmarketDotaClient.name)
  private static readonly TIMEOUT_MS = 30_000

  constructor(
    @Inject('DMARKET_CONFIG') private readonly config: DMarketConfig,
    private readonly rateLimiter: RateLimiterService,
    private readonly retry: RetryService,
  ) {}

  // orderDir=desc — see dmarket-csgo.client.ts for the rationale.
  // Walks the catalog from expensive → cheap; on real listing data
  // this gives a higher unique-per-page ratio than asc and trips the
  // sync's early-exit sooner.
  private buildPath(extraQuery: string): string {
    const base =
      `/exchange/v1/market/items` +
      `?gameId=${DOTA2_GAME_ID}` +
      `&limit=${this.config.batchSize}` +
      `&orderBy=price&orderDir=desc` +
      `&currency=${USD_CURRENCY}`
    return extraQuery ? `${base}&${extraQuery}` : base
  }

  // Common request runner — see dmarket-csgo.client.ts for the full
  // rationale (single place for rate-limit + signing + retry +
  // keep-alive plumbing).
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
            timeout: DmarketDotaClient.TIMEOUT_MS,
            httpsAgent: DMARKET_HTTPS_AGENT,
          },
        )

        observeRateLimitHeaders('dota', response.headers, (msg) =>
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

  // Cursor-only — DMarket's offset pagination is unreliable on this
  // endpoint, see dmarket-csgo.client.ts for the full story.
  async fetchPage(cursor?: string): Promise<DMarketApiResponse> {
    const path = this.buildPath(
      cursor ? `cursor=${encodeURIComponent(cursor)}` : '',
    )
    return this.fetchOnce(path, 'DMarket Dota catalog page')
  }

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
      `Walked ${pageCount} Dota pages, collected ${all.length} items in ${elapsedSec}s`,
    )

    return all
  }
}
