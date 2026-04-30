// One-shot trigger for the CSGO class_instance metadata sync (TM
// market.csgo.com — buy_order, avg_price, popularity_7d, rarity,
// ru_name/quality, text/bg color, phase).
//
// Usage:
//   yarn sync:csgo:class-instance
//
// Expected duration: 1-3 min. Streams the 175 MB feed, aggregates per
// market_hash_name, applies one batched UPDATE per 2000 rows.

// Disable scheduled jobs inside this one-shot script — see
// scripts/sync-prices-once.ts for the rationale.
process.env.DISABLE_SCHEDULED_JOBS = 'true'

import { NestFactory } from '@nestjs/core'
import { Logger } from '@nestjs/common'
import { AppModule } from '../src/app.module'
import { CsgoSyncService } from '../src/modules/skins/csgo/csgo-sync.service'

async function main(): Promise<void> {
  const logger = new Logger('SyncCsgoClassInstanceOnce')

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  })

  try {
    const sync = app.get(CsgoSyncService)

    logger.log('Triggering CSGO class_instance metadata sync (TM stream)...')
    logger.log('Expected duration: 1-3 min (175 MB stream + chunked UPDATEs).')

    const report = await sync.syncClassInstanceMetadata()

    logger.log('Class_instance sync complete. Report:')
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report, null, 2))

    if (report.errors > 0) process.exitCode = 1
  } finally {
    await app.close()
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Class_instance sync script crashed:', err)
  process.exit(1)
})
