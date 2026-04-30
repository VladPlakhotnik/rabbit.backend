// One-shot trigger for the Dota 2 catalog sync. Dota counterpart of
// scripts/sync-csgo-catalog-once.ts.
//
// Usage:
//   yarn sync:dota:catalog
//
// Expected duration: ~25-28 min, same setup as CS — sequential
// cursor walk to natural end + batched UPDATE + HTTP keep-alive +
// retry-429, sharing the global rate-limiter under DMarket's 20 RPS
// cap.

// Disable scheduled jobs inside this one-shot script — see
// scripts/sync-prices-once.ts for the rationale.
process.env.DISABLE_SCHEDULED_JOBS = 'true'

import { NestFactory } from '@nestjs/core'
import { Logger } from '@nestjs/common'
import { AppModule } from '../src/app.module'
import { DotaSyncService } from '../src/modules/skins/dota/dota-sync.service'

async function main(): Promise<void> {
  const logger = new Logger('SyncDotaCatalogOnce')

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  })

  try {
    const sync = app.get(DotaSyncService)

    logger.log('Triggering Dota 2 catalog sync (DMarket walk)...')
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
