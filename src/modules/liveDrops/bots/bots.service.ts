import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import * as crypto from 'crypto'
import { Case } from '../../cases/case.entity'
import { SkinCase } from '../../skinCase/skinCase.entity'
import { LiveDropsService } from '../liveDrops.service'
import type { LiveDropPayload } from '../types'
import { BOT_NAMES } from './bot-names'

// Pacing — uniform 1.5–2.6s. Mean ~2.05s gives ~29 drops/min: tight
// enough that the feed always feels active without overwhelming the eye.
const MIN_INTERVAL_MS = 1_500
const MAX_INTERVAL_MS = 2_600

// In-memory cache TTL for the case list and per-case skinCase lists.
// At ~26 drops/min we'd otherwise hit Postgres ~1500 times/hour with
// `ORDER BY RANDOM()` over the cases table. The cache cuts that to
// ~60 reads/hour. Cases/skin_case rarely change at runtime; admin updates
// take effect within the next minute.
const CASE_CACHE_TTL_MS = 60_000

// Multi-open burst — emulates a real player clicking "open ×4" / "open ×5".
// Same identity + same case across the burst, with sub-second spacing.
// Kept rare (10%) so most of the feed still reads as one-drop-per-user
// rather than serial multi-opens.
const BURST_PROBABILITY = 0.1
const BURST_MIN_COUNT = 3
const BURST_MAX_COUNT = 5
const BURST_INNER_DELAY_MIN_MS = 120
const BURST_INNER_DELAY_MAX_MS = 280

// Tier-based weight boost applied on top of each skin's provably-fair
// `chance`. Preserves the case's character (cheap cases still mostly drop
// cheap items) while making expensive items show up more often than the
// raw probabilities would — a feed full of $0.50 skins doesn't drive
// "ooh, I want to open one too" engagement.
const JACKPOT_THRESHOLD = 50
const MIDDLE_THRESHOLD = 5
const PRICE_BOOST_JACKPOT = 5
const PRICE_BOOST_MIDDLE = 2
const PRICE_BOOST_COMMON = 1

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms))

type CachedCases = { cases: Case[]; loadedAt: number }
type CachedSkinCases = { skinCases: SkinCase[]; loadedAt: number }

@Injectable()
export class LiveDropBotsService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(LiveDropBotsService.name)
  private timeout: NodeJS.Timeout | null = null
  private isShuttingDown = false

  // Caches — expire entries lazily on next read past TTL. No background
  // sweep needed; the working set is at most "all cases" (small).
  private casesCache: CachedCases | null = null
  private readonly skinCasesCache = new Map<number, CachedSkinCases>()

  constructor(
    private readonly liveDropsService: LiveDropsService,
    @InjectRepository(Case)
    private readonly caseRepository: Repository<Case>,
    @InjectRepository(SkinCase)
    private readonly skinCaseRepository: Repository<SkinCase>,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.DISABLE_BOTS === 'true') {
      this.logger.log('Bots disabled via DISABLE_BOTS env')
      return
    }

    this.scheduleNext()
    this.logger.log('LiveDrop bots started')
  }

  onModuleDestroy(): void {
    this.isShuttingDown = true
    if (this.timeout) {
      clearTimeout(this.timeout)
      this.timeout = null
    }
  }

  private scheduleNext(): void {
    if (this.isShuttingDown) return
    const delay =
      MIN_INTERVAL_MS + Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS)
    this.timeout = setTimeout(() => {
      void this.runBotTick().finally(() => this.scheduleNext())
    }, delay)
  }

  private priceBoost(price: number): number {
    if (price >= JACKPOT_THRESHOLD) return PRICE_BOOST_JACKPOT
    if (price >= MIDDLE_THRESHOLD) return PRICE_BOOST_MIDDLE
    return PRICE_BOOST_COMMON
  }

  private async getCachedCases(): Promise<Case[]> {
    const now = Date.now()
    if (
      this.casesCache &&
      now - this.casesCache.loadedAt < CASE_CACHE_TTL_MS
    ) {
      return this.casesCache.cases
    }

    // Skip sold-out cases — a feed advertising drops from a case nobody
    // can buy looks broken.
    const cases = await this.caseRepository
      .createQueryBuilder('cs')
      .where('cs.remaining_count > 0')
      .getMany()

    this.casesCache = { cases, loadedAt: now }
    return cases
  }

  private async pickRandomCase(): Promise<Case | null> {
    const cases = await this.getCachedCases()
    if (cases.length === 0) return null
    return cases[Math.floor(Math.random() * cases.length)]
  }

  private async loadSkinCases(caseId: number): Promise<SkinCase[]> {
    const now = Date.now()
    const cached = this.skinCasesCache.get(caseId)
    if (cached && now - cached.loadedAt < CASE_CACHE_TTL_MS) {
      return cached.skinCases
    }

    const all = await this.skinCaseRepository.find({
      where: { case: { id: caseId }, is_drop_out: true },
      relations: ['skin'],
    })
    // Defensive — `skin` is nullable in the schema, and a NULL would crash
    // the payload builder. Filter rather than throw.
    const skinCases = all.filter(sc => sc.skin != null)

    this.skinCasesCache.set(caseId, { skinCases, loadedAt: now })
    return skinCases
  }

  /**
   * Weighted random pick: weight = chance × priceBoost.
   *
   * Burst-friendly: callers load `skinCases` once and pass it for each
   * drop in the burst, so we don't hit the DB N times per multi-open.
   */
  private pickWeightedSkin(skinCases: SkinCase[]): SkinCase | null {
    if (skinCases.length === 0) return null

    const weights = skinCases.map(sc => {
      const chance = sc.chance > 0 ? sc.chance : 0
      return chance * this.priceBoost(sc.skin.market_price)
    })
    const total = weights.reduce((sum, w) => sum + w, 0)
    if (total <= 0) return null

    let r = Math.random() * total
    for (let i = 0; i < skinCases.length; i++) {
      r -= weights[i]
      if (r <= 0) return skinCases[i]
    }
    // Floating-point fallback — should never trigger in practice, but
    // safer than returning undefined.
    return skinCases[skinCases.length - 1]
  }

  private pickBotIdentity(): { username: string; avatar: string } {
    const username = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]
    // DiceBear renders a deterministic avatar from the seed — same name
    // always gets the same face, so the "user" feels persistent.
    const avatar = `https://api.dicebear.com/7.x/adventurer/png?seed=${encodeURIComponent(
      username,
    )}&size=64`
    return { username, avatar }
  }

  private buildPayload(
    skinCase: SkinCase,
    caseEntity: Case,
    identity: { username: string; avatar: string },
  ): LiveDropPayload {
    return {
      id: crypto.randomUUID(),
      user: { id: null, username: identity.username, avatar: identity.avatar },
      skin: {
        id: skinCase.skin.id,
        name: skinCase.skin.name,
        market_hash_name: skinCase.skin.market_hash_name,
        image: skinCase.skin.image,
        market_price: skinCase.skin.market_price,
        quality: skinCase.skin.quality,
        name_color: skinCase.skin.name_color,
        background_color: skinCase.skin.background_color,
      },
      case: {
        id: caseEntity.id,
        slug: caseEntity.slug,
        name: caseEntity.name,
        img_url: caseEntity.img_url,
      },
      isBot: true,
      ts: Date.now(),
    }
  }

  /**
   * One scheduling step: pick a case, then either drop once or run a burst
   * (multi-open) with the same identity. Burst spacing is sub-second so it
   * reads as one user clicking "open ×N", not as separate visits.
   */
  private async runBotTick(): Promise<void> {
    if (this.isShuttingDown) return

    try {
      const caseEntity = await this.pickRandomCase()
      if (!caseEntity) {
        this.logger.warn('No active cases available — skipping bot tick')
        return
      }

      const skinCases = await this.loadSkinCases(caseEntity.id)
      if (skinCases.length === 0) {
        this.logger.warn(
          `Case ${caseEntity.slug} has no drop-out skins — skipping`,
        )
        return
      }

      const identity = this.pickBotIdentity()
      const isBurst = Math.random() < BURST_PROBABILITY
      const dropCount = isBurst
        ? BURST_MIN_COUNT +
          Math.floor(Math.random() * (BURST_MAX_COUNT - BURST_MIN_COUNT + 1))
        : 1

      for (let i = 0; i < dropCount; i++) {
        if (this.isShuttingDown) return
        const skinCase = this.pickWeightedSkin(skinCases)
        if (!skinCase) break

        await this.liveDropsService.pushDrop(
          this.buildPayload(skinCase, caseEntity, identity),
        )

        if (i < dropCount - 1) {
          await sleep(
            BURST_INNER_DELAY_MIN_MS +
              Math.random() *
                (BURST_INNER_DELAY_MAX_MS - BURST_INNER_DELAY_MIN_MS),
          )
        }
      }
    } catch (err) {
      this.logger.error(
        `Bot tick failed: ${(err as Error).message}`,
        (err as Error).stack,
      )
    }
  }
}
