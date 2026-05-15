// One-shot Redis cleanup for the clicker module.
//
// Usage:
//   yarn ts-node scripts/clear-clicker-redis.ts
//   # or, from the repo root:
//   npx ts-node bunny.backend/scripts/clear-clicker-redis.ts
//
// Connects to the same Redis the backend uses (REDIS_URL env or the
// default localhost:6379) and deletes every key under both the legacy
// `clicker:v2:*` namespace and the current `clicker:v3:*` one. Forces
// every player to re-bootstrap from Postgres on their next click —
// the way to push out a regen-rate / cost / max-energy meta change
// without waiting for warm caches to expire on their own.
//
// Safe to run repeatedly; it just no-ops once the keys are gone.

import 'dotenv/config'
import Redis from 'ioredis'

const PATTERNS = ['clicker:v2:*', 'clicker:v3:*', 'clicker:v4:*', 'clicker:v5:*']

async function main(): Promise<void> {
  const url =
    process.env.REDIS_URL ||
    process.env.REDISCLOUD_URL ||
    'redis://localhost:6379'

  const redis = new Redis(url, { maxRetriesPerRequest: 3 })
  redis.on('error', err => {
    // eslint-disable-next-line no-console
    console.error(`[clear-clicker-redis] connection error: ${err.message}`)
  })

  let deleted = 0
  for (const pattern of PATTERNS) {
    // SCAN over the keyspace in batches — KEYS would block Redis and is
    // unsafe on large dbs. ioredis's `scanStream` handles cursor paging.
    const stream = redis.scanStream({ match: pattern, count: 200 })
    const batch: string[] = []

    await new Promise<void>((resolve, reject) => {
      stream.on('data', (keys: string[]) => {
        batch.push(...keys)
      })
      stream.on('end', () => resolve())
      stream.on('error', reject)
    })

    if (batch.length > 0) {
      // DEL accepts multiple keys; chunk to keep the request size sane.
      const chunkSize = 500
      for (let i = 0; i < batch.length; i += chunkSize) {
        const chunk = batch.slice(i, i + chunkSize)
        deleted += await redis.del(...chunk)
      }
      // eslint-disable-next-line no-console
      console.log(`[clear-clicker-redis] ${pattern}: removed ${batch.length} keys`)
    } else {
      // eslint-disable-next-line no-console
      console.log(`[clear-clicker-redis] ${pattern}: nothing to remove`)
    }
  }

  // eslint-disable-next-line no-console
  console.log(`[clear-clicker-redis] done — ${deleted} keys deleted total`)
  await redis.quit()
}

main().catch(err => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exit(1)
})
