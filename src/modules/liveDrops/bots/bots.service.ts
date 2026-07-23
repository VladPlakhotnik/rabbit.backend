import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, In } from 'typeorm'
import * as crypto from 'crypto'
import { Case } from '../../cases/case.entity'
import { SkinCase } from '../../skinCase/skinCase.entity'
import { CsgoSkin } from '../../skins/csgo-skin.entity'
import { DotaSkin } from '../../skins/dota-skin.entity'
import { LiveDropsService } from '../liveDrops.service'
import type { LiveDropPayload } from '../types'
import { BotProfileService } from '../../bots/bot-profile.service'
import {
  BotProfileSnapshot,
  pickBotStake,
} from '../../bots/bot-behavior.logic'
import { areBotsDisabled } from '../../../core/config/background-jobs'

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

// Per-game probability the bot picks from. Tuned to mirror the real
// CS-vs-Dota audience split — currently CS dominates traffic, so
// fake feed activity should reflect that. If both pools have cases
// available, a uniform random over `cases` would over-represent
// whichever has more cases configured; the explicit weights here
// decouple feed mix from catalog size. Values must sum to 1.
const GAME_PICK_WEIGHTS: Record<'csgo' | 'dota', number> = {
  csgo: 0.9,
  dota: 0.1,
}

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
    private readonly botProfileService: BotProfileService,
    @InjectRepository(Case)
    private readonly caseRepository: Repository<Case>,
    @InjectRepository(SkinCase)
    private readonly skinCaseRepository: Repository<SkinCase>,
    @InjectRepository(DotaSkin)
    private readonly dotaSkinRepository: Repository<DotaSkin>,
  ) {}

  onApplicationBootstrap(): void {
    if (areBotsDisabled()) {
      this.logger.log('LiveDrop bots disabled via env')
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
      .innerJoin(
        SkinCase,
        'skin_case',
        'skin_case.case_id = cs.id AND skin_case.is_drop_out = true',
      )
      .where('cs.remaining_count > 0')
      .andWhere('cs.is_available = true')
      .distinct(true)
      .getMany()

    this.casesCache = { cases, loadedAt: now }
    return cases
  }

  /**
   * Pick a random case for the next bot drop, with a configurable
   * CS-vs-Dota split.
   *
   * Roll a game first (90/10 weighted), then pick uniformly within
   * that game's case pool. This keeps the feed mix independent of
   * catalog size — adding 50 Dota cases doesn't suddenly skew the
   * feed toward Dota.
   *
   * Falls back gracefully:
   *   - If the rolled game has no available cases, switch to the other.
   *   - If neither game has cases, return null (caller skips this tick).
   */
  private async pickRandomCase(
    profile: BotProfileSnapshot,
  ): Promise<Case | null> {
    const cases = await this.getCachedCases()
    if (cases.length === 0) return null

    const csgoCases = cases.filter(c => c.game_type === 'csgo')
    const dotaCases = cases.filter(c => c.game_type === 'dota')

    const rolled: 'csgo' | 'dota' =
      Math.random() < GAME_PICK_WEIGHTS.csgo ? 'csgo' : 'dota'

    // Primary pool first, fall back to the other if it's empty.
    const primary = rolled === 'csgo' ? csgoCases : dotaCases
    const fallback = rolled === 'csgo' ? dotaCases : csgoCases
    let pool = primary.length > 0 ? primary : fallback
    const budget = pickBotStake(profile, 'cases')
    const affordable = pool.filter(c => Number(c.case_price) <= budget * 1.35)

    if (affordable.length > 0) {
      pool = affordable
    }

    if (pool.length === 0) return null
    return pool[Math.floor(Math.random() * pool.length)]
  }

  private async loadSkinCases(caseEntity: Case): Promise<SkinCase[]> {
    const now = Date.now()
    const cached = this.skinCasesCache.get(caseEntity.id)
    if (cached && now - cached.loadedAt < CASE_CACHE_TTL_MS) {
      return cached.skinCases
    }

    const all = await this.skinCaseRepository.find({
      where: { case: { id: caseEntity.id }, is_drop_out: true },
      relations: ['skin'],
    })

    // Polymorphism: SkinCase.@ManyToOne resolves only against
    // csgo_skins, so for Dota cases the JOIN comes back null. Hydrate
    // those rows from dota_skins manually. See case.service.ts for
    // the same pattern.
    if (caseEntity.game_type === 'dota') {
      const missing = all
        .filter(sc => !sc.skin && sc.skin_hash_name)
        .map(sc => sc.skin_hash_name as string)

      if (missing.length > 0) {
        const dotaSkins = await this.dotaSkinRepository.find({
          where: { market_hash_name: In(missing) },
        })
        const byHashName = new Map(
          dotaSkins.map(s => [s.market_hash_name, s]),
        )
        for (const sc of all) {
          if (!sc.skin && sc.skin_hash_name) {
            const dotaSkin = byHashName.get(sc.skin_hash_name)
            if (dotaSkin) sc.skin = dotaSkin as unknown as CsgoSkin
          }
        }
      }
    }

    // Defensive — drop rows whose skin still couldn't be resolved (e.g.
    // legacy data with a hash_name pointing to a now-deleted skin).
    const skinCases = all.filter(sc => sc.skin != null)

    this.skinCasesCache.set(caseEntity.id, { skinCases, loadedAt: now })
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

  private buildPayload(
    skinCase: SkinCase,
    caseEntity: Case,
    identity: BotProfileSnapshot,
  ): LiveDropPayload {
    return {
      id: crypto.randomUUID(),
      user: {
        id: identity.id,
        username: identity.display_name,
        avatar: identity.avatar,
      },
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
      const identity = await this.botProfileService.pickBotProfile()
      if (!identity) {
        this.logger.warn('No bot profiles available - skipping bot tick')
        return
      }

      const caseEntity = await this.pickRandomCase(identity)
      if (!caseEntity) {
        this.logger.warn('No active cases available — skipping bot tick')
        return
      }

      const skinCases = await this.loadSkinCases(caseEntity)
      if (skinCases.length === 0) {
        this.logger.warn(
          `Case ${caseEntity.slug} has no drop-out skins — skipping`,
        )
        return
      }

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
