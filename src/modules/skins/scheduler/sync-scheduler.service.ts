import { Inject, Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import * as crypto from 'crypto'
import Redis from 'ioredis'
import { REDIS_CLIENT } from '../../../core/redis/redis.constants'
import { CsgoSyncService } from '../csgo/csgo-sync.service'
import { DotaSyncService } from '../dota/dota-sync.service'

// Cron-driven entry points for the skin sync flows. Three jobs per
// game:
//
//   prices         — hourly at :00 (CS) / :30 (Dota). Pulls bulk
//                    prices from market.csgo.com, upserts price/volume,
//                    flips status. Cheap; the bulk feed is a single
//                    HTTP + one batched upsert per game.
//
//   class_instance — daily at 04:00 UTC (CS) / 04:30 UTC (Dota).
//                    Streams the 175 MB class_instance feed from TM
//                    and updates buy_order / avg_price / popularity_7d
//                    plus rarity / colors / ru_* on every existing row.
//                    Bigger but still bounded; static metadata stays
//                    static, market signals get a daily refresh.
//
//   catalog        — daily at 03:00 UTC (CS) / 03:30 UTC (Dota). Walks
//                    DMarket for fresh metadata (image / collection /
//                    inspect_in_game etc.). Heavier — ~25 min on full
//                    catalog. Scheduled at low-traffic hours so it
//                    doesn't compete for DB locks with normal traffic.
//
// Price-feed cadence is hourly (was 15 min) because the class_instance
// daily run already provides a buy/sell-side market read; for raw
// price drift over an hour the user-impact is negligible. Trades
// hourly request load against TM in exchange for less log noise.
//
// Why a Redis lock: in production we run multiple backend replicas
// (Heroku auto-scales web dynos, etc.). Without a lock every dyno
// fires the cron simultaneously and we hammer the marketplace 3-5x.
// `SET NX EX` gives us a single-active-leader semantic for the
// duration of the job. The lock is per-job-name + per-game so jobs
// don't block each other.

const CSGO_PRICES_LOCK_KEY = 'skin-sync:csgo:prices:lock'
const CSGO_CATALOG_LOCK_KEY = 'skin-sync:csgo:catalog:lock'
const CSGO_CLASS_INSTANCE_LOCK_KEY = 'skin-sync:csgo:class_instance:lock'
const DOTA_PRICES_LOCK_KEY = 'skin-sync:dota:prices:lock'
const DOTA_CATALOG_LOCK_KEY = 'skin-sync:dota:catalog:lock'
const DOTA_CLASS_INSTANCE_LOCK_KEY = 'skin-sync:dota:class_instance:lock'

// Lock TTLs are picked to be longer than the realistic worst-case
// duration of the job — if a job dies mid-run, the lock auto-expires
// and the next run can recover. They're NOT meant as the regular run
// duration.
const PRICES_LOCK_TTL_SEC = 5 * 60 // 5 minutes — bulk fetch + upsert is seconds in practice
const CATALOG_LOCK_TTL_SEC = 60 * 60 // 1 hour — DMarket walk can take 10-20 min
const CLASS_INSTANCE_LOCK_TTL_SEC = 30 * 60 // 30 minutes — 175 MB stream + chunked UPDATEs typically run 1-3 min

@Injectable()
export class SyncSchedulerService {
  private readonly logger = new Logger(SyncSchedulerService.name)

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly csgoSync: CsgoSyncService,
    private readonly dotaSync: DotaSyncService,
  ) {}

  // Standalone scripts (scripts/sync-*-once.ts) bootstrap AppModule —
  // which registers the @Cron methods below, then they fire on
  // schedule inside the script's process. That's almost never what we
  // want from a one-shot CLI run. The DISABLE_SCHEDULED_JOBS env flag
  // lets the script opt the entire scheduler out at startup.
  private isDisabled(): boolean {
    return process.env.DISABLE_SCHEDULED_JOBS === 'true'
  }

  // ---- CSGO ---------------------------------------------------------

  // Hourly at :00 — pulls TM bulk prices, upserts price/volume.
  @Cron('0 * * * *')
  async cronCsgoPrices(): Promise<void> {
    if (this.isDisabled()) return
    await this.runWithLock(
      CSGO_PRICES_LOCK_KEY,
      PRICES_LOCK_TTL_SEC,
      'csgo prices',
      () => this.csgoSync.syncPrices(),
    )
  }

  // Daily at 03:00 UTC — low-traffic window for a CS-skins site
  // (US west still asleep, EU in deep night).
  @Cron('0 3 * * *')
  async cronCsgoCatalog(): Promise<void> {
    if (this.isDisabled()) return
    await this.runWithLock(
      CSGO_CATALOG_LOCK_KEY,
      CATALOG_LOCK_TTL_SEC,
      'csgo catalog',
      () => this.csgoSync.syncCatalog(),
    )
  }

  // Daily at 04:00 UTC — after the DMarket catalog walk finishes.
  // The class_instance feed and DMarket each fill in different field
  // sets, so order doesn't matter for correctness; spacing them just
  // avoids two big DB-update batches running concurrently.
  @Cron('0 4 * * *')
  async cronCsgoClassInstance(): Promise<void> {
    if (this.isDisabled()) return
    await this.runWithLock(
      CSGO_CLASS_INSTANCE_LOCK_KEY,
      CLASS_INSTANCE_LOCK_TTL_SEC,
      'csgo class_instance',
      () => this.csgoSync.syncClassInstanceMetadata(),
    )
  }

  // ---- Dota 2 -------------------------------------------------------

  // Offset by 30 min so the two games don't hit TM at the same instant
  // and the DB write windows don't overlap.
  @Cron('30 * * * *')
  async cronDotaPrices(): Promise<void> {
    if (this.isDisabled()) return
    await this.runWithLock(
      DOTA_PRICES_LOCK_KEY,
      PRICES_LOCK_TTL_SEC,
      'dota prices',
      () => this.dotaSync.syncPrices(),
    )
  }

  // Daily at 03:30 UTC — 30 min after CSGO catalog so the DMarket
  // rate-limit budget gets a clear window between the two walks.
  @Cron('30 3 * * *')
  async cronDotaCatalog(): Promise<void> {
    if (this.isDisabled()) return
    await this.runWithLock(
      DOTA_CATALOG_LOCK_KEY,
      CATALOG_LOCK_TTL_SEC,
      'dota catalog',
      () => this.dotaSync.syncCatalog(),
    )
  }

  // Daily at 04:30 UTC — 30 min after CSGO class_instance to sequence
  // the two streamed JSONs (similar reason as catalog spacing — avoid
  // two large DB-write windows colliding).
  @Cron('30 4 * * *')
  async cronDotaClassInstance(): Promise<void> {
    if (this.isDisabled()) return
    await this.runWithLock(
      DOTA_CLASS_INSTANCE_LOCK_KEY,
      CLASS_INSTANCE_LOCK_TTL_SEC,
      'dota class_instance',
      () => this.dotaSync.syncClassInstanceMetadata(),
    )
  }

  // Acquire a Redis lock, run the job, release. Returns the job's
  // result on success, undefined when skipped because another replica
  // had the lock.
  private async runWithLock<T>(
    key: string,
    ttlSec: number,
    label: string,
    job: () => Promise<T>,
  ): Promise<T | undefined> {
    // SET key value NX EX ttl — atomic acquire-or-fail.
    // The token (random uuid) is what we check before releasing, so a
    // stale process can't release a lock that's been auto-recovered
    // by a successor.
    const token = crypto.randomUUID()
    const acquired = await this.redis.set(key, token, 'EX', ttlSec, 'NX')

    if (acquired !== 'OK') {
      this.logger.debug(`Skipping ${label}: another replica has the lock`)
      return undefined
    }

    this.logger.log(`Acquired lock for ${label}`)

    try {
      return await job()
    } finally {
      // Lua script for safe release — only delete if we still own the
      // lock. Plain DEL would risk deleting a lock that already
      // expired and got reacquired by someone else.
      const releaseScript =
        'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end'

      try {
        await this.redis.eval(releaseScript, 1, key, token)
      } catch (err) {
        // Don't block the next run if release fails — TTL will reap
        // the lock on its own. Just log so ops can see why a lock
        // appears "stuck" past the run.
        this.logger.warn(
          `Failed to release ${label} lock (will expire via TTL): ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      }
    }
  }
}
