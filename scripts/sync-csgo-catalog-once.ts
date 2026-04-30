// One-shot trigger for the CSGO catalog sync (DMarket metadata
// enrichment). Pulls image / quality / exterior / category /
// item_type / collection / name / colors for all skins already in DB.
//
// Usage:
//   yarn sync:csgo:catalog
//
// Expected duration: ~25-28 min. Sequential cursor walk to the
// natural end of DMarket's catalog (offset pagination is unreliable
// on this endpoint — see dmarket-csgo.client.ts). Stack: ed25519-
// signed requests at ~18 RPS, batched UPDATE … FROM (VALUES …) per
// page, HTTP keep-alive, retry with 429-aware backoff. Walks until
// DMarket returns no further cursor — typically ~7000 pages on CS,
// covering ~70% of DB skins. The remaining 30% are absent from
// DMarket's offer feed and can't be enriched from this source.
// Updates only existing rows — won't create new ones.

// Disable scheduled jobs inside this one-shot script — see
// scripts/sync-prices-once.ts for the rationale.
process.env.DISABLE_SCHEDULED_JOBS = 'true'

import { NestFactory } from '@nestjs/core'
import { Logger } from '@nestjs/common'
import { AppModule } from '../src/app.module'
import { CsgoSyncService } from '../src/modules/skins/csgo/csgo-sync.service'

async function main(): Promise<void> {
  const logger = new Logger('SyncCsgoCatalogOnce')

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  })

  try {
    const sync = app.get(CsgoSyncService)

    logger.log('Triggering CSGO catalog sync (DMarket walk)...')
    logger.log('Expected duration: ~25-28 min (sequential cursor walk @ ~18 RPS, batched UPDATE, keep-alive, full coverage of DMarket catalog).')

    const report = await sync.syncCatalog()

    logger.log('Catalog sync complete. Report:')
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report, null, 2))

    if (report.errors > 0) process.exitCode = 1
  } finally {
    await app.close()
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Catalog sync script crashed:', err)
  process.exit(1)
})
