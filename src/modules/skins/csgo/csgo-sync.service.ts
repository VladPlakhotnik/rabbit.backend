import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { CsgoSkin } from '../csgo-skin.entity'
import { TmMarketClient, TmMarketPriceItem } from '../shared/market-tm.client'
import { DmarketCsgoClient } from './dmarket-csgo.client'
import { parseHashName } from '../shared/hash-name-parser'
import { applyMarkup, getMarkupFactor } from '../shared/pricing.utils'
import { SkinStatus } from '../shared/skin-status.enum'
import { CsgoSkinService } from './csgo-skin.service'
import { DMarketSkinInfo } from '../types/dmarket.types'
import {
  applyMetadataUpdatesBatch,
  ColumnSpec,
} from '../shared/batch-update'

// Sequential cursor walk — no early-stop cutoff. The walk terminates
// only when DMarket returns an empty page or no further cursor, which
// is the natural end of the catalog. Earlier iterations had a
// uniqueness-based cutoff to skip a presumed "dead tail", but the
// real CS catalog stays at ~0.4 uniques/page even at the very end —
// every page adds something. Cutting it to "save time" would simply
// drop real coverage with marginal time savings (~5%).
//
// The 30% of DB skins not picked up by this walk (e.g., 7800 of
// 26500 on a recent run) are physically absent from DMarket's offer
// feed — no listings, no metadata. They can't be enriched from this
// source regardless of how long we walk.
//
// Note on parallelism: an earlier iteration tried 4 concurrent workers
// using offset-based pagination. DMarket caps offset around ~5100 with
// HTTP 400, and even within the cap the offset endpoint returned
// near-identical item sets across workers (~14% of cursor's
// uniqueness rate per page) — presumably because offset uses a
// session-cached result rather than a stable price-sorted window.
// Cursor pagination is the documented stable form but is inherently
// sequential. Keeping the walk sequential here, leaning on the other
// optimizations (keep-alive, batched UPDATE, ed25519 auth, rate-limit
// chain, retry on 429) for total throughput.

// Per-page metadata columns the catalog sync touches. Mirror of the
// fields populated in `buildMetadataUpdates` below. Hard-coded list +
// hard-coded SQL types — never derived from user input — since the
// names and types feed straight into the UPDATE statement.
const CSGO_UPDATE_COLUMNS: ReadonlyArray<ColumnSpec<CsgoSkin>> = [
  { name: 'image', sqlType: 'text', jsKey: 'image' },
  { name: 'slug', sqlType: 'text', jsKey: 'slug' },
  { name: 'name', sqlType: 'text', jsKey: 'name' },
  { name: 'inspect_in_game', sqlType: 'text', jsKey: 'inspect_in_game' },
  { name: 'quality', sqlType: 'text', jsKey: 'quality' },
  { name: 'exterior', sqlType: 'text', jsKey: 'exterior' },
  { name: 'category', sqlType: 'text', jsKey: 'category' },
  { name: 'item_type', sqlType: 'text', jsKey: 'item_type' },
  { name: 'collection', sqlType: 'varchar[]', jsKey: 'collection' },
  { name: 'name_color', sqlType: 'text', jsKey: 'name_color' },
  { name: 'background_color', sqlType: 'text', jsKey: 'background_color' },
  { name: 'float_value', sqlType: 'real', jsKey: 'float_value' },
  { name: 'float_part_value', sqlType: 'text', jsKey: 'float_part_value' },
  { name: 'pattern', sqlType: 'int', jsKey: 'pattern' },
]

// Columns updated by the daily TM class_instance sync. Volatile market
// signals (buy_order / avg_price / popularity_7d) overwrite — they're
// the whole point of the daily refresh. Static metadata (rarity / ru_*
// / phase / colors) uses COALESCE so a stale TM null can't blank out
// data that another source already filled in.
const CSGO_CLASS_INSTANCE_COLUMNS: ReadonlyArray<ColumnSpec<CsgoSkin>> = [
  { name: 'buy_order', sqlType: 'numeric', jsKey: 'buy_order', overwrite: true },
  { name: 'avg_price', sqlType: 'numeric', jsKey: 'avg_price', overwrite: true },
  { name: 'popularity_7d', sqlType: 'int', jsKey: 'popularity_7d', overwrite: true },
  { name: 'ru_name', sqlType: 'text', jsKey: 'ru_name' },
  { name: 'ru_quality', sqlType: 'text', jsKey: 'ru_quality' },
  { name: 'rarity', sqlType: 'text', jsKey: 'rarity' },
  { name: 'phase', sqlType: 'text', jsKey: 'phase' },
  { name: 'name_color', sqlType: 'text', jsKey: 'name_color' },
  { name: 'background_color', sqlType: 'text', jsKey: 'background_color' },
]

// Injection token for the CS-game TM client. Dota gets its own token
// in PR2. Imported from `skin.module.ts` would be a circular dep, so
// the literal lives here too.
const TM_CSGO_CLIENT_TOKEN = 'TM_CSGO_CLIENT'

// Orchestrator for CS2 skin sync. Two independent flows:
//
//   syncPrices()   — runs every ~15 min. Pulls bulk prices from
//                    market.csgo.com, upserts price/volume rows,
//                    flips status (available ↔ unavailable_on_market)
//                    based on what's in the snapshot.
//
//   syncCatalog()  — runs once a day (low-traffic hours). Walks the
//                    DMarket catalog and fills metadata fields
//                    (image, exterior, category, item_type, ...) on
//                    rows that already exist in DB. Never creates
//                    new rows — that's the price feed's job.
//
// Source-of-truth contract (per user's requirements):
//   - market.csgo.com decides whether a skin exists in our DB.
//   - DMarket only fills in cosmetic / categorical fields.
//   - Skins missing from market are kept in DB (status flipped),
//     never deleted — they're often referenced by case_skin /
//     user_inventory and may come back next week.

interface PriceSyncReport {
  fetched: number
  upsertedPrices: number
  newRowsCreated: number
  markedUnavailable: number
  markedAvailableAgain: number
  errors: number
  durationMs: number
}

interface CatalogSyncReport {
  pagesWalked: number
  itemsExamined: number
  metadataUpdated: number
  errors: number
  durationMs: number
}

interface ClassInstanceSyncReport {
  entriesFetched: number
  metadataUpdated: number
  skipped: number
  errors: number
  durationMs: number
}

// Max rows per batched UPDATE statement. PostgreSQL's bind-parameter
// limit is 65535 — at 10 placeholders per row (id + 9 metadata cols)
// the hard ceiling is 6500 rows, but we leave plenty of headroom.
const CLASS_INSTANCE_UPDATE_CHUNK = 2000

@Injectable()
export class CsgoSyncService {
  private readonly logger = new Logger(CsgoSyncService.name)

  // The TM client is injected via DI token (one instance per game),
  // so the same service shape can be reused for the Dota sync in PR2
  // — only the token + base URL change.
  constructor(
    @InjectRepository(CsgoSkin)
    private readonly repo: Repository<CsgoSkin>,
    private readonly skinService: CsgoSkinService,
    @Inject(TM_CSGO_CLIENT_TOKEN)
    private readonly tm: TmMarketClient,
    private readonly dmarket: DmarketCsgoClient,
  ) {}

  // ---- Price sync (frequent) ----------------------------------------

  async syncPrices(): Promise<PriceSyncReport> {
    const startedAt = Date.now()
    const report: PriceSyncReport = {
      fetched: 0,
      upsertedPrices: 0,
      newRowsCreated: 0,
      markedUnavailable: 0,
      markedAvailableAgain: 0,
      errors: 0,
      durationMs: 0,
    }

    try {
      const snapshot = await this.tm.fetchPricesBulk()
      report.fetched = snapshot.items.length

      if (snapshot.items.length === 0) {
        this.logger.warn(
          'TM bulk feed returned 0 items — refusing to mark all DB skins unavailable. Aborting.',
        )
        return { ...report, durationMs: Date.now() - startedAt }
      }

      // Bulk upsert prices for every item in the feed. Single SQL
      // statement instead of the previous N-statement loop — typical
      // savings on a 30k-row sync: ~5 minutes → ~5 seconds.
      const upserted = await this.bulkUpsertFromFeed(snapshot.items)
      report.upsertedPrices = upserted.upsertedExisting
      report.newRowsCreated = upserted.created

      // Status reconciliation. Two passes — they're cheap (bounded
      // UPDATE on indexed status column) and keeping them as separate
      // statements makes the intent obvious.
      const seenHashNames = snapshot.items.map((i) => i.market_hash_name)
      report.markedUnavailable = await this.skinService.markStaleAsUnavailable(seenHashNames)
      report.markedAvailableAgain = await this.skinService.markReturnedAsAvailable(seenHashNames)

      this.logger.log(
        `Prices sync: fetched=${report.fetched} ` +
          `upserted=${report.upsertedPrices} new=${report.newRowsCreated} ` +
          `→unavailable=${report.markedUnavailable} →available=${report.markedAvailableAgain}`,
      )
    } catch (error) {
      report.errors++
      this.logger.error(
        `Prices sync failed: ${error instanceof Error ? error.message : 'unknown'}`,
        error instanceof Error ? error.stack : undefined,
      )
    }

    report.durationMs = Date.now() - startedAt
    return report
  }

  // Single batched UPSERT against `csgo_skins`, keyed by
  // `market_hash_name`. Existing rows update their price + status +
  // last_seen; rows that don't exist yet are created with parsed
  // hash_name fields and status='available' (metadata fields stay
  // null until catalog sync fills them).
  private async bulkUpsertFromFeed(
    items: TmMarketPriceItem[],
  ): Promise<{ upsertedExisting: number; created: number }> {
    const markup = getMarkupFactor()
    const now = new Date()

    const rows = items
      .map((item) => {
        const rawPrice = Number.parseFloat(item.price)

        if (!Number.isFinite(rawPrice) || rawPrice < 0) return null

        const parsed = parseHashName(item.market_hash_name)

        return {
          market_hash_name: item.market_hash_name,
          raw_market_price: rawPrice,
          market_price: applyMarkup(rawPrice, markup),
          amount_in_market: item.volume,
          status: SkinStatus.Available,
          last_seen_in_feed_at: now,
          weapon: parsed.weapon,
          skin_name: parsed.skin_name,
          exterior: parsed.exterior,
          is_stattrak: parsed.is_stattrak,
          is_souvenir: parsed.is_souvenir,
          // `name` mirrors hash_name on first insert so the row passes
          // the existing "name IS NOT NULL" filter on the market UI.
          // The DMarket catalog sync will overwrite it with the proper
          // human-readable name later.
          name: item.market_hash_name,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)

    if (rows.length === 0) return { upsertedExisting: 0, created: 0 }

    // To distinguish INSERT vs UPDATE counts, sample DB state before
    // and after — TypeORM's upsert() doesn't return per-row
    // INSERT/UPDATE outcomes (`xmax` tricks are PG-internal and not
    // worth the complexity here). The diff between counts is exact
    // for the "newly created" bucket; the rest is updates. Keeping
    // it here instead of inside the loop avoids an extra query per
    // batch.
    const countBefore = await this.repo.count()

    const BATCH = 500

    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH)

      // .upsert() emits `INSERT ... ON CONFLICT DO UPDATE` keyed on
      // market_hash_name (UNIQUE). Skip the update if the row's
      // values are unchanged to avoid no-op UPDATE traffic.
      await this.repo.upsert(slice, {
        conflictPaths: ['market_hash_name'],
        skipUpdateIfNoValuesChanged: true,
        upsertType: 'on-conflict-do-update',
      })
    }

    const countAfter = await this.repo.count()
    const created = Math.max(0, countAfter - countBefore)

    return {
      upsertedExisting: rows.length - created,
      created,
    }
  }

  // ---- Catalog sync (daily) -----------------------------------------

  async syncCatalog(): Promise<CatalogSyncReport> {
    const startedAt = Date.now()
    const report: CatalogSyncReport = {
      pagesWalked: 0,
      itemsExamined: 0,
      metadataUpdated: 0,
      errors: 0,
      durationMs: 0,
    }

    try {
      // Pre-load known hash_name → id mapping. DMarket items that
      // aren't in DB get ignored — price feed creates rows, catalog
      // only enriches.
      const existing = await this.repo.find({
        select: ['id', 'market_hash_name'],
      })
      const existingByName = new Map<string, number>(
        existing.map((s) => [s.market_hash_name, s.id]),
      )

      this.logger.log(
        `Catalog sync starting — ${existingByName.size} skins in DB to enrich`,
      )

      // Dedup tracker. DMarket's /market/items returns *every offer*
      // (one per seller listing), not unique skins. AK-47 | Asiimov
      // (FT) might come back 5-10 times across pages from different
      // sellers — we'd otherwise update the same DB row 5-10 times
      // with identical data.
      const seen = new Set<string>()

      let cursor: string | undefined
      let page = 0
      let lastLoggedPage = 0

      while (true) {
        page++
        report.pagesWalked = page

        const response = await this.dmarket.fetchPage(cursor)

        if (!response.objects?.length) break

        report.itemsExamined += response.objects.length

        const updates = this.buildMetadataUpdates(
          response.objects,
          existingByName,
          seen,
        )

        if (updates.length > 0) {
          // id-sort keeps Postgres's per-row lock acquisition
          // deterministic — minimises deadlock risk against any
          // concurrent writer (price sync, future admin tools)
          // touching the same rows.
          updates.sort((a, b) => a.id - b.id)

          report.metadataUpdated += await applyMetadataUpdatesBatch(
            this.repo,
            'csgo_skins',
            CSGO_UPDATE_COLUMNS,
            updates,
          )
        }

        // Progress beat — once per 5 pages keeps log volume reasonable.
        if (page - lastLoggedPage >= 5) {
          lastLoggedPage = page
          const seconds = Math.ceil((Date.now() - startedAt) / 1000)
          this.logger.log(
            `[CSGO catalog] page ${page} • examined ${report.itemsExamined} ` +
              `• unique enriched ${seen.size}/${existingByName.size} • elapsed ${seconds}s`,
          )
        }

        // Full-coverage early exit (rare — usually a few % of DB
        // skins aren't in DMarket's offer feed at all, so seen.size
        // tops out before reaching existingByName.size and the loop
        // exits via "no cursor" or "empty objects" further below).
        if (seen.size >= existingByName.size) {
          this.logger.log(
            `[CSGO catalog] all ${seen.size} known skins enriched — stopping early`,
          )
          break
        }

        cursor = response.cursor ?? undefined
        if (!cursor) break
      }

      this.logger.log(
        `Catalog sync: pages=${report.pagesWalked} examined=${report.itemsExamined} updated=${report.metadataUpdated}`,
      )
    } catch (error) {
      report.errors++
      this.logger.error(
        `Catalog sync failed: ${error instanceof Error ? error.message : 'unknown'}`,
        error instanceof Error ? error.stack : undefined,
      )
    }

    report.durationMs = Date.now() - startedAt
    return report
  }

  // ---- Class_instance metadata sync (TM, daily) ---------------------
  //
  // Pulls market.csgo.com's class_instance feed, which is the same
  // marketplace that drives our prices (single source of truth) and
  // additionally exposes:
  //   - market signals: buy_order, avg_price, popularity_7d
  //   - presentation: ru_name, ru_quality, ru_rarity, text_color,
  //     bg_color, phase
  //
  // The feed is ~175 MB and returns one entry per (classid, instance)
  // pair — many entries collapse to the same market_hash_name, so the
  // TM client streams + aggregates per hash_name before we get the
  // result. See market-tm.client.ts:fetchClassInstanceMetadata.
  //
  // Why daily, not every-15-min like prices: the file is large and the
  // class-level metadata (rarity / colors / ru_name) is stable. The
  // volatile market signals (buy_order / avg_price / popularity_7d) do
  // benefit from more frequent updates, but a once-a-day snapshot is
  // already much fresher than the DMarket catalog walk and good
  // enough for the buy-from-user pricing flow.
  async syncClassInstanceMetadata(): Promise<ClassInstanceSyncReport> {
    const startedAt = Date.now()
    const report: ClassInstanceSyncReport = {
      entriesFetched: 0,
      metadataUpdated: 0,
      skipped: 0,
      errors: 0,
      durationMs: 0,
    }

    try {
      // Pre-load the existing-skins index. Class_instance entries for
      // hash_names we don't have in DB are silently skipped — adding
      // rows is the price-sync's job (it's the source-of-truth for
      // "does this skin exist on the market").
      const existing = await this.repo.find({
        select: ['id', 'market_hash_name'],
      })
      const existingByName = new Map<string, number>(
        existing.map((s) => [s.market_hash_name, s.id]),
      )

      this.logger.log(
        `Class_instance sync starting — ${existingByName.size} skins in DB to enrich`,
      )

      const tmMetadata = await this.tm.fetchClassInstanceMetadata()
      report.entriesFetched = tmMetadata.size

      // Map TM metadata → partial CsgoSkin updates. The mapping is
      // straight column rename (TM `text_color` → DB `name_color`,
      // TM `ru_rarity` → DB `rarity`); all other fields keep their
      // names. Only rows whose hash_name is in DB make it through.
      const updates: Array<Partial<CsgoSkin> & { id: number }> = []
      for (const [hashName, meta] of tmMetadata) {
        const id = existingByName.get(hashName)
        if (id === undefined) {
          report.skipped++
          continue
        }
        updates.push({
          id,
          buy_order: meta.buy_order,
          avg_price: meta.avg_price,
          popularity_7d: meta.popularity_7d,
          ru_name: meta.ru_name,
          ru_quality: meta.ru_quality,
          rarity: meta.ru_rarity,
          phase: meta.phase,
          // name_color / background_color are typed non-null on the
          // CsgoSkin entity (existing DMarket-sourced contract), but
          // the TM source can return null. Coerce → undefined so the
          // batched UPDATE writes SQL NULL and the COALESCE keeps the
          // existing value when TM has nothing to add.
          name_color: meta.text_color ?? undefined,
          background_color: meta.bg_color ?? undefined,
        })
      }

      if (updates.length > 0) {
        // Sort by id for deterministic per-row lock acquisition order.
        updates.sort((a, b) => a.id - b.id)

        // Chunked execution to stay under PostgreSQL's bind-parameter
        // limit. The chunk size is well below the hard cap so a future
        // schema change adding more columns won't suddenly start
        // failing.
        for (let i = 0; i < updates.length; i += CLASS_INSTANCE_UPDATE_CHUNK) {
          const chunk = updates.slice(i, i + CLASS_INSTANCE_UPDATE_CHUNK)
          report.metadataUpdated += await applyMetadataUpdatesBatch(
            this.repo,
            'csgo_skins',
            CSGO_CLASS_INSTANCE_COLUMNS,
            chunk,
          )
        }
      }

      this.logger.log(
        `Class_instance sync: fetched=${report.entriesFetched} updated=${report.metadataUpdated} skipped(notInDb)=${report.skipped}`,
      )
    } catch (error) {
      report.errors++
      this.logger.error(
        `Class_instance sync failed: ${error instanceof Error ? error.message : 'unknown'}`,
        error instanceof Error ? error.stack : undefined,
      )
    }

    report.durationMs = Date.now() - startedAt
    return report
  }

  // Map DMarket items → partial entity rows for `repo.save()`. Only
  // touches metadata fields — never resets price (that's the price
  // sync's authority). Returns rows with `id` set so save() does
  // UPDATE; rows whose hash_name isn't in DB are dropped.
  private buildMetadataUpdates(
    items: DMarketSkinInfo[],
    knownByHashName: Map<string, number>,
    seen: Set<string>,
  ): Array<Partial<CsgoSkin> & { id: number }> {
    const updates: Array<Partial<CsgoSkin> & { id: number }> = []

    for (const item of items) {
      const id = knownByHashName.get(item.title)

      if (id === undefined) continue
      // Already enriched on a previous page — skip duplicate UPDATE.
      if (seen.has(item.title)) continue
      seen.add(item.title)

      const update: Partial<CsgoSkin> & { id: number } = { id }

      // Apply each field only when DMarket actually returned a value;
      // an empty/undefined response shouldn't blank out columns we
      // already have populated from a previous run.
      if (item.image) update.image = item.image
      if (item.slug) update.slug = item.slug
      if (item.extra?.name) update.name = item.extra.name
      if (item.extra?.inspectInGame) update.inspect_in_game = item.extra.inspectInGame
      if (item.extra?.quality) update.quality = item.extra.quality
      if (item.extra?.exterior) update.exterior = item.extra.exterior
      if (item.extra?.category) update.category = item.extra.category
      if (item.extra?.itemType) update.item_type = item.extra.itemType
      if (item.extra?.collection) update.collection = item.extra.collection
      if (item.extra?.nameColor) update.name_color = item.extra.nameColor
      if (item.extra?.backgroundColor) update.background_color = item.extra.backgroundColor
      if (typeof item.extra?.floatValue === 'number') {
        update.float_value = item.extra.floatValue
      }
      if (item.extra?.floatPartValue) {
        update.float_part_value = item.extra.floatPartValue
      }
      if (typeof item.extra?.paintSeed === 'number') {
        update.pattern = item.extra.paintSeed
      }

      // Skip rows where DMarket returned no actionable metadata —
      // would just emit a no-op UPDATE.
      if (Object.keys(update).length > 1) {
        updates.push(update)
      }
    }

    return updates
  }
}
