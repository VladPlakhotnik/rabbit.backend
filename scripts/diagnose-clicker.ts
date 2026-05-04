// Dump the autoclicker-relevant state for a single user from both
// Postgres and Redis side-by-side. Use to triage the "I waited but
// nothing accumulated" class of bugs without manually wrangling
// psql + redis-cli.
//
// Usage:
//   yarn ts-node scripts/diagnose-clicker.ts <user_id>
//   # or
//   npx ts-node rabbit.backend/scripts/diagnose-clicker.ts <user_id>
//
// Reads:
//   - REDIS_URL / REDISCLOUD_URL (or localhost:6379)
//   - DATABASE_URL                (PG connection)

import 'dotenv/config'
import Redis from 'ioredis'
// @ts-expect-error — `pg` is a transitive dep via TypeORM; the project
// hasn't pulled in @types/pg, so we use it untyped here. This is a
// dev-only script, so forgoing types is fine.
import { Client } from 'pg'

const userId = Number(process.argv[2])
if (!Number.isFinite(userId) || userId <= 0) {
  // eslint-disable-next-line no-console
  console.error('Usage: ts-node scripts/diagnose-clicker.ts <user_id>')
  process.exit(1)
}

async function main(): Promise<void> {
  const redisUrl =
    process.env.REDIS_URL ||
    process.env.REDISCLOUD_URL ||
    'redis://localhost:6379'
  const dbUrl = process.env.DATABASE_URL

  if (!dbUrl) {
    // eslint-disable-next-line no-console
    console.error('DATABASE_URL is required')
    process.exit(1)
  }

  const pg = new Client({ connectionString: dbUrl })
  await pg.connect()
  const pgRow = await pg.query(
    `
    SELECT
      cu.user_id,
      cu.points,
      cu.total_points,
      cu.energy_amount,
      cu.last_energy_update,
      cu.level_id,
      cu.auto_clicker_level_id,
      cu.auto_clicker_pending_count,
      cu.auto_clicker_pending_value,
      cu.auto_clicker_last_claim_at,
      acl.level             AS auto_clicker_level,
      acl.duration_sec      AS auto_clicker_max_idle_sec
    FROM clicker_users cu
    LEFT JOIN clicker_auto_clicker_levels acl
      ON acl.id = cu.auto_clicker_level_id
    WHERE cu.user_id = $1
    `,
    [userId],
  )
  await pg.end()

  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 3 })
  const ukey = `clicker:v5:u:${userId}`
  const hash = await redis.hgetall(ukey)
  const ttl = await redis.ttl(ukey)
  await redis.quit()

  // eslint-disable-next-line no-console
  console.log('==== POSTGRES ====')
  if (pgRow.rowCount === 0) {
    // eslint-disable-next-line no-console
    console.log(`(no clicker_users row for user_id=${userId})`)
  } else {
    // eslint-disable-next-line no-console
    console.log(pgRow.rows[0])
  }

  // eslint-disable-next-line no-console
  console.log('\n==== REDIS hash', ukey, '====')
  if (Object.keys(hash).length === 0) {
    // eslint-disable-next-line no-console
    console.log(`(empty / cold cache, ttl=${ttl})`)
  } else {
    const lc = Number(hash.lc) || 0
    const ad = Number(hash.ad) || 0
    const as = Number(hash.as) || 0
    const ac = Number(hash.ac) || 0
    const apc = Number(hash.apc) || 0
    const apv = Number(hash.apv) || 0
    const c = Number(hash.c) || 0
    const e = Number(hash.e) || 0
    const m = Number(hash.m) || 0
    const r = Number(hash.r) || 0
    const tp = Number(hash.tp) || 0
    const now = Date.now()
    // eslint-disable-next-line no-console
    console.log({
      ttl_sec: ttl,
      points: hash.p,
      total_points: tp,
      energy: e,
      max_energy: m,
      cost: c,
      regen_milli: r,
      lc,
      lc_age_sec: lc > 0 ? Math.round((now - lc) / 1000) : null,
      ad_max_idle_sec: ad,
      as,
      ac,
      apc,
      apv,
    })

    // eslint-disable-next-line no-console
    console.log('\n==== DIAGNOSIS ====')
    const idleThresholdSec = Number(
      process.env.CLICKER_AUTO_CLICKER_IDLE_THRESHOLD_SEC || 60,
    )
    if (ad === 0) {
      // eslint-disable-next-line no-console
      console.log(
        '⚠ ad=0 — autoclicker not unlocked (auto_clicker_level_id is NULL or bootstrap missed it).',
      )
    } else if (apc > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `✔ apc=${apc}, apv=${apv} — bank has pending. Frontend should auto-open the claim modal on next ack.`,
      )
    } else if (lc === 0) {
      // eslint-disable-next-line no-console
      console.log(
        '⚠ lc=0 — last manual click never recorded. Bootstrap should set lc=last_energy_update; check that ran.',
      )
    } else if (now - lc < idleThresholdSec * 1000) {
      // eslint-disable-next-line no-console
      console.log(
        `⚠ Idle only ${Math.round((now - lc) / 1000)}s — under threshold (${idleThresholdSec}s). Wait longer or set CLICKER_AUTO_CLICKER_IDLE_THRESHOLD_SEC=3.`,
      )
    } else if (as === 0) {
      // eslint-disable-next-line no-console
      console.log(
        '⚠ Idle long enough but as=0 — accumulation never started. Lua only sets as on count=0 (getState) call. Did the frontend send getState after returning?',
      )
    } else if (ac < as + ad * 1000 && ac < now) {
      // eslint-disable-next-line no-console
      console.log(
        `✔ Accumulating: as=${as}, ac=${ac}, sim ran ${Math.round((ac - as) / 1000)}s of ${ad}s cap.`,
      )
    } else {
      // eslint-disable-next-line no-console
      console.log('? Bank empty, accumulation either capped or just started.')
    }
  }
}

main().catch(err => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exit(1)
})
