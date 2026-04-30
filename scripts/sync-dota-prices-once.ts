// One-shot trigger for the Dota 2 price sync — Dota counterpart of
// scripts/sync-prices-once.ts. See that file for the rationale +
// behaviour notes.
//
// Usage:
//   yarn ts-node scripts/sync-dota-prices-once.ts

// Disable scheduled jobs inside this one-shot script — see
// scripts/sync-prices-once.ts for the rationale.
process.env.DISABLE_SCHEDULED_JOBS = 'true'

import { NestFactory } from '@nestjs/core'
import { Logger } from '@nestjs/common'
import { AppModule } from '../src/app.module'
import { DotaSyncService } from '../src/modules/skins/dota/dota-sync.service'

async function main(): Promise<void> {
  const logger = new Logger('SyncDotaPricesOnce')

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  })

  try {
    const sync = app.get(DotaSyncService)

    logger.log('Triggering Dota 2 price sync...')
    const report = await sync.syncPrices()

    logger.log('Sync complete. Report:')
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report, null, 2))

    if (report.errors > 0) process.exitCode = 1
  } finally {
    await app.close()
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Sync script crashed:', err)
  process.exit(1)
})
