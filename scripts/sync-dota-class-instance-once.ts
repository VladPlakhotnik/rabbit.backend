// One-shot trigger for the Dota 2 class_instance metadata sync. Dota
// counterpart of scripts/sync-csgo-class-instance-once.ts.
//
// Usage:
//   yarn sync:dota:class-instance

process.env.DISABLE_SCHEDULED_JOBS = 'true'

import { NestFactory } from '@nestjs/core'
import { Logger } from '@nestjs/common'
import { AppModule } from '../src/app.module'
import { DotaSyncService } from '../src/modules/skins/dota/dota-sync.service'

async function main(): Promise<void> {
  const logger = new Logger('SyncDotaClassInstanceOnce')

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  })

  try {
    const sync = app.get(DotaSyncService)

    logger.log('Triggering Dota 2 class_instance metadata sync (TM stream)...')
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
