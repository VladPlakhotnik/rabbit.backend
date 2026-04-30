import { Injectable, Logger } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'
import axios from 'axios'
import parser from 'stream-json'
// Subpaths must carry the `.js` suffix because stream-json's
// package.json `exports` is a pattern map (`./* → ./src/*`) that
// substitutes verbatim — without an extension Node's resolver
// can't find the file. TypeScript at compile time uses classic
// `moduleResolution: Node` which doesn't honor exports at all,
// so the type stubs in src/types/stream-json.d.ts cover the same
// suffixed paths.
import pick from 'stream-json/filters/pick.js'
import streamObject from 'stream-json/streamers/stream-object.js'

// Shared client for the TM marketplace pair (market.csgo.com + market.dota2.net).
// Both are run by the same operator (Avenger Networks) and expose an
// identical v2 API shape — same endpoints, same response schemas, same
// auth pattern (api key in query string). One client class, two
// instances at module-construction time.
//
// What lives here vs. the per-game wrappers:
//   here: the raw HTTP+JSON dance + retry/timeout discipline
//   per-game: the upsert-into-DB logic + scheduling
//
// Rate limit: documented at 100 req/day per key on free tier. We use
// at most a handful per cron run (one bulk price call, occasional
// per-item lookup), so we don't add a rate-limiter here yet — the per-
// game sync service can add backoff if it ever hits 429.

export interface TmMarketPriceItem {
  market_hash_name: string
  // Volume comes back as a string ("0", "12", ...) — keep raw so the
  // upsert layer can decide how to coerce + filter.
  volume: string
  // Price is also a string in USD with two decimals. Parse on the
  // upsert side, where we know if 0 means "out of stock" vs "free
  // sticker".
  price: string
}

export interface TmMarketPricesResponse {
  success: boolean
  // Server-side timestamp at the moment of the snapshot. Useful for
  // debugging "why did prices not change" — if `time` is stale, the
  // upstream cache is stuck, not us.
  time: number
  currency: string
  items: TmMarketPriceItem[]
}

// Aggregated class_instance metadata for one market_hash_name. The TM
// class_instance endpoint returns one entry per (classid, instance_id)
// pair — popular skins like "AK-47 | Asiimov (FT)" can have dozens
// of entries spanning paint seeds and Doppler phases. We collapse
// them per hash_name with sensible aggregations.
export interface TmClassInstanceMetadata {
  market_hash_name: string
  // max bid across all class+instance variants of this skin.
  buy_order: number | null
  // arithmetic mean of `avg_price` across non-null entries — TM
  // doesn't expose a per-skin reference price, so an average across
  // listings is the closest signal.
  avg_price: number | null
  // sum of recent sales — represents total trading activity for the
  // hash_name, regardless of phase.
  popularity_7d: number | null
  // First non-empty value seen — these are class-level attributes,
  // identical across all entries for the same hash_name.
  ru_name: string | null
  ru_quality: string | null
  ru_rarity: string | null
  text_color: string | null
  bg_color: string | null
  phase: string | null
}

// Raw shape of one entry inside `items` on the class_instance feed —
// what TM returns *before* aggregation. Most fields are optional because
// TM omits empty / unknown values from individual entries.
interface RawClassInstanceEntry {
  price?: string | number | null
  buy_order?: string | number | null
  avg_price?: string | number | null
  popularity_7d?: string | number | null
  market_hash_name?: string
  ru_name?: string
  ru_rarity?: string
  ru_quality?: string
  text_color?: string
  bg_color?: string
  phase?: string
}

// Per-hash_name accumulator used during streaming aggregation. Reduced
// to TmClassInstanceMetadata at the end.
interface ClassInstanceAggregator {
  market_hash_name: string
  maxBuyOrder: number | null
  sumAvgPrice: number
  countAvgPrice: number
  sumPopularity: number
  hasPopularity: boolean
  ru_name: string | null
  ru_quality: string | null
  ru_rarity: string | null
  text_color: string | null
  bg_color: string | null
  phase: string | null
}

const parseNumeric = (raw: unknown): number | null => {
  if (raw === null || raw === undefined || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number.parseFloat(String(raw))
  return Number.isFinite(n) ? n : null
}

const firstNonEmpty = (
  current: string | null,
  candidate: string | undefined,
): string | null => {
  if (current && current.length > 0) return current
  if (candidate && candidate.length > 0) return candidate
  return current
}

interface TmMarketClientConfig {
  // e.g. "https://market.csgo.com" or "https://market.dota2.net".
  baseUrl: string
  // The TM API key. Required for buy-for and authenticated endpoints;
  // optional for the bulk price feed (which is public). We keep it on
  // the instance regardless so PR4 (withdrawals) can reuse the same
  // client without re-plumbing auth.
  apiKey: string
  // HTTP timeout per request. TM's bulk endpoint can be slow when
  // their cache is regenerating — give it room but cap so we don't
  // hold a worker forever.
  timeoutMs?: number
  // Identifying string for logs. Defaults to baseUrl host.
  label?: string
}

@Injectable()
export class TmMarketClient {
  private readonly logger: Logger
  private readonly config: Required<TmMarketClientConfig>

  constructor(
    private readonly http: HttpService,
    config: TmMarketClientConfig,
  ) {
    this.config = {
      timeoutMs: 30_000,
      label: new URL(config.baseUrl).host,
      ...config,
    }
    this.logger = new Logger(`TmMarketClient[${this.config.label}]`)
  }

  // Bulk price snapshot. Public endpoint, no auth required, but we
  // pass the key when set in case the operator ever throttles
  // unauthenticated requests harder than authenticated ones.
  async fetchPricesBulk(): Promise<TmMarketPricesResponse> {
    const url = `${this.config.baseUrl}/api/v2/prices/USD.json`

    this.logger.log(`Fetching bulk prices from ${url}`)

    const response = await firstValueFrom(
      this.http.get<TmMarketPricesResponse>(url, {
        timeout: this.config.timeoutMs,
        headers: {
          'User-Agent': 'Rabbit-Backend/1.0',
        },
      }),
    )

    const data = response.data

    if (!data || data.success !== true || !Array.isArray(data.items)) {
      throw new Error(
        `Invalid response from ${this.config.label}: success=${data?.success}, items=${data?.items?.length ?? 'undefined'}`,
      )
    }

    this.logger.log(
      `Got ${data.items.length} price entries from ${this.config.label} (snapshot ts=${data.time})`,
    )

    return data
  }

  // Class+instance bulk feed — returns ~280k entries at ~175 MB JSON.
  // We can't `JSON.parse` a 175 MB document without spiking process RAM
  // by 5-10x; stream-json reads from the HTTP stream incrementally and
  // emits one (key, value) pair at a time, so peak memory stays bound
  // by the aggregator size (~25k entries × ~200 bytes ≈ 5 MB).
  //
  // Returns a Map keyed by `market_hash_name`. Multiple class_instance
  // pairs collapse into one map entry via the aggregations described
  // on TmClassInstanceMetadata.
  async fetchClassInstanceMetadata(): Promise<
    Map<string, TmClassInstanceMetadata>
  > {
    const url = `${this.config.baseUrl}/api/v2/prices/class_instance/USD.json`
    this.logger.log(`Streaming class_instance feed from ${url}`)

    const startedAt = Date.now()

    // axios with responseType: 'stream' gives us a readable stream
    // that auto-decodes gzip if the server uses it (Accept-Encoding
    // is added by the http adapter). We use the static axios import
    // directly here — HttpService wraps everything in an Observable,
    // which adds friction for stream consumption.
    const response = await axios.get(url, {
      timeout: this.config.timeoutMs,
      headers: { 'User-Agent': 'Rabbit-Backend/1.0' },
      responseType: 'stream',
    })

    const aggregators = new Map<string, ClassInstanceAggregator>()
    let entriesSeen = 0

    // Pipeline:
    //   raw bytes → JSON tokens (parser)
    //              → keep only the `items` subtree (pick.asStream)
    //              → emit each entry of that object as {key, value}
    //                events (streamObject.asStream)
    //
    // Uses `.asStream()` factories — the bare `pick(...)` and
    // `streamObject(...)` return token-handler functions, not Duplex
    // streams; only `.asStream` produces a Duplex that can sit in a
    // pipe chain.
    const stream = response.data
      .pipe(parser())
      .pipe(pick.asStream({ filter: 'items' }))
      .pipe(streamObject.asStream())

    await new Promise<void>((resolve, reject) => {
      stream.on(
        'data',
        ({ value }: { key: string; value: RawClassInstanceEntry }) => {
          const hashName = value.market_hash_name
          if (!hashName || hashName.length === 0) return

          entriesSeen++

          let agg = aggregators.get(hashName)
          if (!agg) {
            agg = {
              market_hash_name: hashName,
              maxBuyOrder: null,
              sumAvgPrice: 0,
              countAvgPrice: 0,
              sumPopularity: 0,
              hasPopularity: false,
              ru_name: null,
              ru_quality: null,
              ru_rarity: null,
              text_color: null,
              bg_color: null,
              phase: null,
            }
            aggregators.set(hashName, agg)
          }

          // Aggregations.
          const buyOrder = parseNumeric(value.buy_order)
          if (buyOrder !== null) {
            agg.maxBuyOrder =
              agg.maxBuyOrder === null
                ? buyOrder
                : Math.max(agg.maxBuyOrder, buyOrder)
          }

          const avg = parseNumeric(value.avg_price)
          if (avg !== null) {
            agg.sumAvgPrice += avg
            agg.countAvgPrice += 1
          }

          const pop = parseNumeric(value.popularity_7d)
          if (pop !== null) {
            agg.sumPopularity += pop
            agg.hasPopularity = true
          }

          // Class-level attributes — same across all entries for one
          // hash_name. Take the first non-empty seen.
          agg.ru_name = firstNonEmpty(agg.ru_name, value.ru_name)
          agg.ru_quality = firstNonEmpty(agg.ru_quality, value.ru_quality)
          agg.ru_rarity = firstNonEmpty(agg.ru_rarity, value.ru_rarity)
          agg.text_color = firstNonEmpty(agg.text_color, value.text_color)
          agg.bg_color = firstNonEmpty(agg.bg_color, value.bg_color)
          agg.phase = firstNonEmpty(agg.phase, value.phase)
        },
      )

      stream.on('end', () => resolve())
      stream.on('error', (err: Error) => reject(err))
    })

    // Reduce aggregators → final metadata map.
    const result = new Map<string, TmClassInstanceMetadata>()
    for (const [name, agg] of aggregators) {
      result.set(name, {
        market_hash_name: name,
        buy_order: agg.maxBuyOrder,
        avg_price:
          agg.countAvgPrice > 0
            ? Math.round((agg.sumAvgPrice / agg.countAvgPrice) * 100) / 100
            : null,
        popularity_7d: agg.hasPopularity ? agg.sumPopularity : null,
        ru_name: agg.ru_name,
        ru_quality: agg.ru_quality,
        ru_rarity: agg.ru_rarity,
        text_color: agg.text_color,
        bg_color: agg.bg_color,
        phase: agg.phase,
      })
    }

    const elapsedSec = Math.ceil((Date.now() - startedAt) / 1000)
    this.logger.log(
      `class_instance: parsed ${entriesSeen} entries → ${result.size} unique hash_names in ${elapsedSec}s`,
    )

    return result
  }

  // Buy + ship-to-user endpoint. Recipient `partner` and `token` come
  // from the user's Steam trade URL (parsed by `parseTradeUrl`).
  // `customId` is our internal withdrawal-request id — TM echoes it
  // back on status checks for idempotent matching.
  //
  // TM accepts `hash_name` directly here — no separate "find an offer
  // id first" step. They do the cheapest-matching server-side and
  // either buy at the live price (if it's at or below our `price`
  // ceiling) or fail the call with a "no offers" error.
  //
  // Price encoding (per TM docs):
  //   1 USD = 1000  /  1 EUR = 1000  /  1 RUB = 100
  // We assume the account currency is USD (matches `prices/USD.json`
  // we sync from). $5.50 → 5500 in the wire format.
  //
  // `chance_to_transfer=80` filters TM offers to sellers with ≥80%
  // historical delivery rate — fewer Steam-trade-not-accepted failures
  // at the cost of slightly fewer matchable offers. Defensive default.
  //
  // User-Agent is mandatory: without it Cloudflare in front of TM
  // returns HTTP 401 on write endpoints (the public price feeds happen
  // to skip that rule, hence the inconsistency we hit during dev).
  //
  // Returns the raw TM response; the withdraw service narrows it.
  async buyForUser(args: {
    hashName: string
    maxPrice: number // in USD, full units (we convert internally)
    partner: string
    token: string
    customId: string
  }): Promise<TmBuyForResponse> {
    const path = '/api/v2/buy-for'
    const priceWire = Math.round(args.maxPrice * 1000)
    const url =
      `${this.config.baseUrl}${path}` +
      `?key=${encodeURIComponent(this.config.apiKey)}` +
      `&hash_name=${encodeURIComponent(args.hashName)}` +
      `&price=${priceWire}` +
      `&partner=${encodeURIComponent(args.partner)}` +
      `&token=${encodeURIComponent(args.token)}` +
      `&chance_to_transfer=80` +
      `&custom_id=${encodeURIComponent(args.customId)}`

    // Log a redacted version of the URL so we can correlate with TM's
    // server logs without leaking the secret key.
    const redactedUrl = url.replace(
      /key=[^&]+/,
      `key=${this.config.apiKey.slice(0, 4)}...${this.config.apiKey.slice(-4)}`,
    )
    this.logger.log(`buy-for → ${redactedUrl}`)

    let response
    try {
      response = await firstValueFrom(
        this.http.get<TmBuyForResponse>(url, {
          timeout: this.config.timeoutMs,
          headers: { 'User-Agent': 'Rabbit-Backend/1.0' },
          // Don't throw on 4xx — let us inspect the body. TM returns
          // 200 + {success:false} for normal errors; if we see a 401
          // body it's almost certainly Cloudflare or an account-state
          // gate, and the body text often tells us which.
          validateStatus: () => true,
        }),
      )
    } catch (err) {
      // Network-level failure (DNS, timeout, connection reset). Real
      // 401s shouldn't end up here because of validateStatus above.
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(`buy-for transport failure: ${message}`)
      throw err
    }

    if (response.status !== 200) {
      // Truncate the body so a Cloudflare HTML challenge page doesn't
      // bury the rest of the log; the first 1k usually contains the
      // diagnostic text we care about. Cast to `unknown` first because
      // the typed `response.data: TmBuyForResponse` excludes strings,
      // and on a 4xx the body is whatever Cloudflare/TM sent (HTML, JSON,
      // empty) — not the typed shape.
      const rawBody = response.data as unknown
      const bodySnippet =
        typeof rawBody === 'string'
          ? rawBody.slice(0, 1000)
          : JSON.stringify(rawBody).slice(0, 1000)
      this.logger.error(
        `buy-for HTTP ${response.status} ` +
          `headers=${JSON.stringify(response.headers)} ` +
          `body=${bodySnippet}`,
      )
      // Surface a structured failure to the service layer so it can
      // refund the inventory + persist a meaningful failure_reason.
      return {
        success: false,
        error: `HTTP ${response.status}: ${bodySnippet.slice(0, 200)}`,
      }
    }

    return response.data
  }

  // ---- Order status polling -----------------------------------------
  //
  // TM exposes `/api/v2/get-buy-info-by-custom-id` returning the buy
  // order matched on the `custom_id` we passed to /buy-for. The previous
  // version of this client called `/api/v2/get-orders`, which doesn't
  // exist on the TM API — every poll silently returned 404 and the
  // status state machine never advanced.
  //
  // Stage codes for buy/sell events (per TM docs):
  //   1 — TRADE_STAGE_NEW       (TM still preparing the buy)
  //   2 — TRADE_STAGE_ITEM_GIVEN (Steam trade dispatched / accepted)
  //   5 — TRADE_STAGE_TIMED_OUT  (trade expired, refund issued)
  //
  // The 0/10/20/30/100/105/110 codes documented elsewhere on TM are
  // for *checkout* events (deposits/withdrawals of money), not item
  // trades — don't confuse them with buy-for stage values.
  //
  // `settlement` (unix timestamp, string or number, may be null) is
  // populated when the trade has finalised — successful delivery or
  // a finalised refund. Combined with stage it disambiguates
  // delivering-vs-completed for the consumer.
  async getOrderStatus(customId: string): Promise<TmOrder | null> {
    const path = '/api/v2/get-buy-info-by-custom-id'
    const url =
      `${this.config.baseUrl}${path}` +
      `?key=${encodeURIComponent(this.config.apiKey)}` +
      `&custom_id=${encodeURIComponent(customId)}`

    const response = await firstValueFrom(
      this.http.get<TmBuyInfoResponse>(url, {
        timeout: this.config.timeoutMs,
        headers: { 'User-Agent': 'Rabbit-Backend/1.0' },
      }),
    )

    const data = response.data
    // `data` is an object (single record), not an array — distinct from
    // get-list-buy-info-by-custom-id which returns a keyed map.
    if (!data || data.success !== true || !data.data || typeof data.data !== 'object') {
      return null
    }

    const raw = data.data
    const stage = Number.parseInt(String(raw.stage ?? '0'), 10)
    if (!Number.isFinite(stage)) return null

    // Settlement may arrive as "0" / "" / null / number — normalise to
    // a finite positive number, treat anything else as "not settled".
    const settlementRaw = raw.settlement
    const settlementNum =
      settlementRaw == null || settlementRaw === ''
        ? 0
        : Number.parseInt(String(settlementRaw), 10)
    const settlement = Number.isFinite(settlementNum) && settlementNum > 0 ? settlementNum : 0

    return {
      stage,
      settlement,
      paid: raw.paid ?? null,
      trade_id: raw.trade_id ?? null,
      causer: typeof raw.causer === 'string' ? raw.causer : null,
    }
  }
}

// ---- TM API response shapes ---------------------------------------

export interface TmBuyForResponse {
  success: boolean
  // Returned only on success. Same as TM's internal order id; we store
  // it on the withdrawal row for joining with TM-side support tickets.
  id?: string | number
  // Failure-side fields. `error` is a human-readable string, `code` is
  // a stable numeric id from the TM error table (e.g. 21 = recipient
  // inventory full, 7 = no mobile authenticator). UI surfaces `error`,
  // logs include both for triage.
  error?: string
  code?: number
}

// Narrowed shape returned by getOrderStatus — only the fields the
// withdraw service actually consumes. Stage is normalised to number
// at the client boundary so consumers don't deal with TM's mixed
// string/number formatting.
export interface TmOrder {
  // 1 / 2 / 5 — see getOrderStatus comment.
  stage: number
  // 0 if not yet settled, unix timestamp once finalised. Combined with
  // stage to disambiguate stage=2 (delivering vs completed).
  settlement: number
  // What TM actually paid. Float in major currency units (USD: 0.9 =
  // $0.90) on this endpoint — note operation-history uses a different
  // string-in-copecks format, but get-buy-info-by-custom-id is float.
  paid: string | number | null
  // Steam trade id of the dispatched trade. null until stage >= 2.
  trade_id: string | number | null
  // Set on refunds (stage=5): "buyer" or "seller". Helps render
  // failure-reason in the UI.
  causer: string | null
}

// Raw shape of the get-buy-info-by-custom-id payload. Internal — the
// public TmOrder narrows + normalises this.
interface TmBuyInfoRaw {
  stage?: string | number
  settlement?: string | number | null
  paid?: string | number | null
  trade_id?: string | number | null
  causer?: string | null
  [key: string]: unknown
}

interface TmBuyInfoResponse {
  success: boolean
  data?: TmBuyInfoRaw
  error?: string
}

// ---- Buy-for failure code mapping ----------------------------------
//
// TM documents these numeric `code` values on a failed `buy-for`
// response (alongside a free-form `error` string). The withdraw
// service turns the code into one of the stable keys below; the
// frontend i18n maps each key to a localized user message.
//
// Mapping per TM docs (https://market.csgo.com/en/api/content/sell_buy):
//   2  — generic unknown error, retry possible
//   3  — TM bot couldn't verify the recipient's trade URL
//   5  — recipient's Steam inventory is set to private/hidden
//   6  — recipient is banned in Steam
//   7  — recipient hasn't enabled Steam Guard mobile authenticator
//   8  — TM couldn't verify the URL (offline-trade flag missing)
//   12 — trade URL is malformed/invalid
//   20 — TM's verifier bot is currently banned in Steam
//   21 — recipient's Steam inventory is full
//
// Codes 3 and 8 both surface as "trade URL check failed" semantically;
// keeping them as separate keys lets the frontend phrase them
// distinctly if the UX team wants to in the future.
export const TM_BUY_FOR_ERROR_KEYS: Record<number, string> = {
  2: 'tm_unknown_error',
  3: 'tm_trade_url_check_failed',
  5: 'tm_recipient_inventory_hidden',
  6: 'tm_user_banned',
  7: 'tm_no_mobile_authenticator',
  8: 'tm_trade_url_check_offline',
  12: 'tm_invalid_trade_url',
  20: 'tm_bot_banned',
  21: 'tm_recipient_inventory_full',
}
