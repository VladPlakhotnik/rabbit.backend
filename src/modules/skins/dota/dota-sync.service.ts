import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { DotaSkin } from '../dota-skin.entity'
import { TmMarketClient, TmMarketPriceItem } from '../shared/market-tm.client'
import { DmarketDotaClient } from './dmarket-dota.client'
import { applyMarkup, getMarkupFactor } from '../shared/pricing.utils'
import { SkinStatus } from '../shared/skin-status.enum'
import { DotaSkinService } from './dota-skin.service'
import { DMarketSkinInfo } from '../types/dmarket.types'
import {
  applyMetadataUpdatesBatch,
  ColumnSpec,
} from '../shared/batch-update'

// Sequential cursor walk to natural end. See csgo-sync.service.ts
// for the rationale (no early-stop cutoff; ~30% of DB skins are
// absent from DMarket's offer feed and can't be enriched here
// regardless of walk length).

// Per-page metadata columns the Dota catalog sync touches. CS-only
// columns (float_value, float_part_value, pattern, exterior) are
// absent; Dota-only ones (hero, slot, rarity) are present.
const DOTA_UPDATE_COLUMNS: ReadonlyArray<ColumnSpec<DotaSkin>> = [
  { name: 'image', sqlType: 'text', jsKey: 'image' },
  { name: 'slug', sqlType: 'text', jsKey: 'slug' },
  { name: 'name', sqlType: 'text', jsKey: 'name' },
  { name: 'inspect_in_game', sqlType: 'text', jsKey: 'inspect_in_game' },
  { name: 'quality', sqlType: 'text', jsKey: 'quality' },
  { name: 'category', sqlType: 'text', jsKey: 'category' },
  { name: 'item_type', sqlType: 'text', jsKey: 'item_type' },
  { name: 'collection', sqlType: 'varchar[]', jsKey: 'collection' },
  { name: 'name_color', sqlType: 'text', jsKey: 'name_color' },
  { name: 'background_color', sqlType: 'text', jsKey: 'background_color' },
  { name: 'hero', sqlType: 'text', jsKey: 'hero' },
  { name: 'slot', sqlType: 'text', jsKey: 'slot' },
  { name: 'rarity', sqlType: 'text', jsKey: 'rarity' },
]

// Columns updated by the daily TM class_instance sync — see
// csgo-sync.service.ts for the full rationale. Dota's `rarity` already
// exists from the original schema, so the mapping `ru_rarity → rarity`
// is identical to CS.
const DOTA_CLASS_INSTANCE_COLUMNS: ReadonlyArray<ColumnSpec<DotaSkin>> = [
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

const CLASS_INSTANCE_UPDATE_CHUNK = 2000

// Injection token for the Dota TM client. Same pattern as CSGO —
// see csgo-sync.service.ts for the rationale.
const TM_DOTA2_CLIENT_TOKEN = 'TM_DOTA2_CLIENT'

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

// Dota 2 orchestrator. Mirrors CsgoSyncService — same source-of-truth
// rule, same status flow, same upsert mechanics. The diffs from CS:
//   - No StatTrak / Souvenir / exterior parsing — Dota doesn't have
//     those concepts.
//   - DMarket enrichment populates Dota-only fields (hero, slot,
//     rarity, quality) instead of CS-only ones.
//   - Different DI tokens / repo / TM client instance.

@Injectable()
export class DotaSyncService {
  private readonly logger = new Logger(DotaSyncService.name)

  constructor(
    @InjectRepository(DotaSkin)
    private readonly repo: Repository<DotaSkin>,
    private readonly skinService: DotaSkinService,
    @Inject(TM_DOTA2_CLIENT_TOKEN)
    private readonly tm: TmMarketClient,
    private readonly dmarket: DmarketDotaClient,
  ) {}

  // ---- Price sync ---------------------------------------------------

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
          'TM Dota bulk feed returned 0 items — refusing to mark all DB skins unavailable. Aborting.',
        )
        return { ...report, durationMs: Date.now() - startedAt }
      }

      const upserted = await this.bulkUpsertFromFeed(snapshot.items)
      report.upsertedPrices = upserted.upsertedExisting
      report.newRowsCreated = upserted.created

      const seenHashNames = snapshot.items.map((i) => i.market_hash_name)
      report.markedUnavailable = await this.skinService.markStaleAsUnavailable(seenHashNames)
      report.markedAvailableAgain = await this.skinService.markReturnedAsAvailable(seenHashNames)

      this.logger.log(
        `Dota prices sync: fetched=${report.fetched} ` +
          `upserted=${report.upsertedPrices} new=${report.newRowsCreated} ` +
          `→unavailable=${report.markedUnavailable} →available=${report.markedAvailableAgain}`,
      )
    } catch (error) {
      report.errors++
      this.logger.error(
        `Dota prices sync failed: ${error instanceof Error ? error.message : 'unknown'}`,
        error instanceof Error ? error.stack : undefined,
      )
    }

    report.durationMs = Date.now() - startedAt
    return report
  }

  private async bulkUpsertFromFeed(
    items: TmMarketPriceItem[],
  ): Promise<{ upsertedExisting: number; created: number }> {
    const markup = getMarkupFactor()
    const now = new Date()

    const rows = items
      .map((item) => {
        const rawPrice = Number.parseFloat(item.price)

        if (!Number.isFinite(rawPrice) || rawPrice < 0) return null

        return {
          market_hash_name: item.market_hash_name,
          raw_market_price: rawPrice,
          market_price: applyMarkup(rawPrice, markup),
          amount_in_market: item.volume,
          status: SkinStatus.Available,
          last_seen_in_feed_at: now,
          // `name` mirrors hash_name on insert so the row passes the
          // "name IS NOT NULL" filter on the market UI. DMarket
          // catalog sync will overwrite with the human-readable name.
          name: item.market_hash_name,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)

    if (rows.length === 0) return { upsertedExisting: 0, created: 0 }

    // See CsgoSyncService.bulkUpsertFromFeed for the rationale —
    // exact INSERT-vs-UPDATE split via row count diff before/after.
    const countBefore = await this.repo.count()

    const BATCH = 500

    for (let i = 0; i < rows.length; i += BATCH) {
      await this.repo.upsert(rows.slice(i, i + BATCH), {
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

  // ---- Catalog sync (DMarket metadata enrichment) -------------------

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
      const existing = await this.repo.find({
        select: ['id', 'market_hash_name'],
      })
      const knownByName = new Map<string, number>(
        existing.map((s) => [s.market_hash_name, s.id]),
      )

      this.logger.log(
        `Dota catalog sync starting — ${knownByName.size} skins in DB to enrich`,
      )

      // Dedup tracker — see csgo-sync.service.ts for the full note.
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

        const updates = this.buildMetadataUpdates(response.objects, knownByName, seen)

        if (updates.length > 0) {
          updates.sort((a, b) => a.id - b.id)

          report.metadataUpdated += await applyMetadataUpdatesBatch(
            this.repo,
            'dota_skins',
            DOTA_UPDATE_COLUMNS,
            updates,
          )
        }

        if (page - lastLoggedPage >= 5) {
          lastLoggedPage = page
          const seconds = Math.ceil((Date.now() - startedAt) / 1000)
          this.logger.log(
            `[Dota catalog] page ${page} • examined ${report.itemsExamined} ` +
              `• unique enriched ${seen.size}/${knownByName.size} • elapsed ${seconds}s`,
          )
        }

        if (seen.size >= knownByName.size) {
          this.logger.log(
            `[Dota catalog] all ${seen.size} known skins enriched — stopping early`,
          )
          break
        }

        cursor = response.cursor ?? undefined
        if (!cursor) break
      }

      this.logger.log(
        `Dota catalog sync: pages=${report.pagesWalked} examined=${report.itemsExamined} updated=${report.metadataUpdated}`,
      )
    } catch (error) {
      report.errors++
      this.logger.error(
        `Dota catalog sync failed: ${error instanceof Error ? error.message : 'unknown'}`,
        error instanceof Error ? error.stack : undefined,
      )
    }

    report.durationMs = Date.now() - startedAt
    return report
  }

  // ---- Class_instance metadata sync (TM, daily) ---------------------
  //
  // See csgo-sync.service.ts:syncClassInstanceMetadata for the full
  // rationale. Dota mirror uses the same TM endpoint (the URL is
  // game-agnostic — class_instance returns CS+Dota items in one feed,
  // discriminator is the market_hash_name format) but writes to
  // dota_skins via DOTA_CLASS_INSTANCE_COLUMNS.
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
      const existing = await this.repo.find({
        select: ['id', 'market_hash_name'],
      })
      const existingByName = new Map<string, number>(
        existing.map((s) => [s.market_hash_name, s.id]),
      )

      this.logger.log(
        `Dota class_instance sync starting — ${existingByName.size} skins in DB to enrich`,
      )

      const tmMetadata = await this.tm.fetchClassInstanceMetadata()
      report.entriesFetched = tmMetadata.size

      const updates: Array<Partial<DotaSkin> & { id: number }> = []
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
          name_color: meta.text_color,
          background_color: meta.bg_color,
        })
      }

      if (updates.length > 0) {
        updates.sort((a, b) => a.id - b.id)

        for (let i = 0; i < updates.length; i += CLASS_INSTANCE_UPDATE_CHUNK) {
          const chunk = updates.slice(i, i + CLASS_INSTANCE_UPDATE_CHUNK)
          report.metadataUpdated += await applyMetadataUpdatesBatch(
            this.repo,
            'dota_skins',
            DOTA_CLASS_INSTANCE_COLUMNS,
            chunk,
          )
        }
      }

      this.logger.log(
        `Dota class_instance sync: fetched=${report.entriesFetched} updated=${report.metadataUpdated} skipped(notInDb)=${report.skipped}`,
      )
    } catch (error) {
      report.errors++
      this.logger.error(
        `Dota class_instance sync failed: ${error instanceof Error ? error.message : 'unknown'}`,
        error instanceof Error ? error.stack : undefined,
      )
    }

    report.durationMs = Date.now() - startedAt
    return report
  }

  // Map DMarket Dota items → partial updates. Targets only fields
  // that exist on DotaSkin; CS-specific fields (float, paint, etc.)
  // are dropped silently.
  private buildMetadataUpdates(
    items: DMarketSkinInfo[],
    knownByName: Map<string, number>,
    seen: Set<string>,
  ): Array<Partial<DotaSkin> & { id: number }> {
    const updates: Array<Partial<DotaSkin> & { id: number }> = []

    for (const item of items) {
      const id = knownByName.get(item.title)

      if (id === undefined) continue
      if (seen.has(item.title)) continue
      seen.add(item.title)

      const update: Partial<DotaSkin> & { id: number } = { id }

      if (item.image) update.image = item.image
      if (item.slug) update.slug = item.slug
      if (item.extra?.name) update.name = item.extra.name
      if (item.extra?.inspectInGame) update.inspect_in_game = item.extra.inspectInGame
      if (item.extra?.quality) update.quality = item.extra.quality
      if (item.extra?.category) update.category = item.extra.category
      if (item.extra?.itemType) update.item_type = item.extra.itemType
      if (item.extra?.collection) update.collection = item.extra.collection
      if (item.extra?.nameColor) update.name_color = item.extra.nameColor
      if (item.extra?.backgroundColor) update.background_color = item.extra.backgroundColor

      // Dota-specific fields. DMarket exposes hero / slot / rarity
      // through `extra` for Dota items; not all are present on every
      // item (e.g. couriers have no hero). We use type-cast access
      // because dmarket.types.ts was modelled for CS originally;
      // expanding the type is a future cleanup, not in this PR.
      const extraAny = item.extra as Record<string, unknown> | undefined
      if (extraAny?.hero && typeof extraAny.hero === 'string') {
        update.hero = extraAny.hero
      }
      if (extraAny?.slot && typeof extraAny.slot === 'string') {
        update.slot = extraAny.slot
      }
      if (extraAny?.rarity && typeof extraAny.rarity === 'string') {
        update.rarity = extraAny.rarity
      }

      if (Object.keys(update).length > 1) {
        updates.push(update)
      }
    }

    return updates
  }
}
