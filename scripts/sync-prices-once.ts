// Standalone one-shot trigger for the CS price sync.
//
// Usage:
//   yarn ts-node scripts/sync-prices-once.ts
//
// Bootstraps the full Nest application context (no HTTP server, no
// listeners), grabs the CsgoSyncService, runs syncPrices() once, prints
// the report, exits.
//
// Useful for:
//   - Filling new columns (raw_market_price, weapon, skin_name, status,
//     is_stattrak, is_souvenir, last_seen_in_feed_at) right after the
//     PR1 migration, without waiting for the cron.
//   - Manual re-runs after a marketplace recovery if the cron run
//     missed the window.
//   - Local dev — verify config / network reach to market.csgo.com
//     before relying on the scheduler.

// Disable the cron-driven scheduled jobs *before* AppModule loads —
// SyncSchedulerService reads this env var on each cron firing and
// returns early. Without this, a long-running sync script would have
// the @Cron methods firing inside the same process every 15 minutes.
process.env.DISABLE_SCHEDULED_JOBS = 'true'

import { NestFactory } from '@nestjs/core'
import { Logger } from '@nestjs/common'
import { AppModule } from '../src/app.module'
import { CsgoSyncService } from '../src/modules/skins/csgo/csgo-sync.service'

async function main(): Promise<void> {
  const logger = new Logger('SyncPricesOnce')

  // createApplicationContext (instead of NestFactory.create) skips the
  // HTTP/Swagger setup — we only need the DI container, not a
  // listening server. Cuts boot time by ~3-4 sec on this codebase.
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  })

  try {
    const sync = app.get(CsgoSyncService)

    logger.log('Triggering CS price sync...')
    const report = await sync.syncPrices()

    logger.log('Sync complete. Report:')
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report, null, 2))

    if (report.errors > 0) {
      // Non-zero exit so a CI / Heroku run reports failure.
      process.exitCode = 1
    }
  } finally {
    await app.close()
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Sync script crashed:', err)
  process.exit(1)
})
