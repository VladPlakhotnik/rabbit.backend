import {
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common'
import { ClickerLevelsService } from '../../clickerLevels/clicker-levels.service'
import { ClickerClickLevelsService } from '../../clickerClickLevels/clicker-click-levels.service'
import { ClickerEnergyLevelsService } from '../../clickerEnergyLevels/clicker-energy-levels.service'
import { ClickerLevel } from '../../clickerLevels/entities/clicker_level.entity'
import { ClickerClickLevel } from '../../clickerClickLevels/entities/clicker_click_level.entity'
import { ClickerEnergyLevel } from '../../clickerEnergyLevels/entities/clicker_energy_level.entity'
import { LEVELS_CACHE_TTL_MS } from '../constants/clicker.constants'

/**
 * In-memory cache of every level catalog (bunny / click / energy).
 * Loaded once at module init and refreshed lazily after the TTL — the
 * tables are admin-only (rare changes) and read on every bootstrap +
 * level-bump check, so caching them in process beats hitting Postgres
 * each time.
 *
 * The cache is shared across requests (singleton service); a single
 * concurrent refresh is gated by `refreshPromise` so a burst of cold
 * lookups doesn't spawn duplicate queries.
 *
 * Why not Redis: these tables are <100 rows total, the level catalog
 * never changes mid-deploy, and an in-process Map is one less hop on
 * the hot path. A multi-instance deploy still shares Postgres as the
 * source of truth — each instance just keeps its own warm copy.
 */
@Injectable()
export class ClickerLevelsCacheService implements OnModuleInit {
  private readonly logger = new Logger(ClickerLevelsCacheService.name)

  private bunnyLevels: ClickerLevel[] = []
  private clickLevels: ClickerClickLevel[] = []
  private energyLevels: ClickerEnergyLevel[] = []

  private bunnyLoadedAt = 0
  private clickLoadedAt = 0
  private energyLoadedAt = 0

  private bunnyRefresh: Promise<ClickerLevel[]> | null = null
  private clickRefresh: Promise<ClickerClickLevel[]> | null = null
  private energyRefresh: Promise<ClickerEnergyLevel[]> | null = null

  constructor(
    private readonly bunnyLevelsService: ClickerLevelsService,
    private readonly clickLevelsService: ClickerClickLevelsService,
    private readonly energyLevelsService: ClickerEnergyLevelsService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Eager warm-up: every endpoint that needs levels would otherwise
    // pay a first-hit cost on cold lookup. Runs in parallel; module
    // boot waits on them all.
    try {
      await Promise.all([
        this.refreshBunny(),
        this.refreshClick(),
        this.refreshEnergy(),
      ])
      this.logger.log(
        `Pre-fetched levels: bunny=${this.bunnyLevels.length}, click=${this.clickLevels.length}, energy=${this.energyLevels.length}`,
      )
    } catch (err) {
      // Don't fail module init — better to limp along with empty
      // caches that auto-refresh on demand than refuse to start the
      // whole API. The first endpoint hit will retry.
      this.logger.error(
        `Level pre-fetch failed: ${err instanceof Error ? err.message : err}`,
      )
    }
  }

  /** Sorted ascending by id. Returns reference to the cached array. */
  async getBunnyLevels(): Promise<ClickerLevel[]> {
    if (this.isFresh(this.bunnyLoadedAt) && this.bunnyLevels.length > 0) {
      return this.bunnyLevels
    }
    return this.refreshBunny()
  }

  async getClickLevels(): Promise<ClickerClickLevel[]> {
    if (this.isFresh(this.clickLoadedAt) && this.clickLevels.length > 0) {
      return this.clickLevels
    }
    return this.refreshClick()
  }

  async getEnergyLevels(): Promise<ClickerEnergyLevel[]> {
    if (this.isFresh(this.energyLoadedAt) && this.energyLevels.length > 0) {
      return this.energyLevels
    }
    return this.refreshEnergy()
  }

  /**
   * Find the next bunny level (current_id + 1) without a DB hit.
   * Returns null when at max level or the catalog is empty (cold).
   */
  async findNextBunnyLevel(currentLevelId: number): Promise<ClickerLevel | null> {
    const all = await this.getBunnyLevels()
    if (all.length === 0) return null
    return all.find(l => l.id === currentLevelId + 1) ?? null
  }

  async findClickLevelById(id: number): Promise<ClickerClickLevel | null> {
    const all = await this.getClickLevels()
    return all.find(l => l.id === id) ?? null
  }

  async findEnergyLevelById(id: number): Promise<ClickerEnergyLevel | null> {
    const all = await this.getEnergyLevels()
    return all.find(l => l.id === id) ?? null
  }

  /**
   * Force-invalidate. Call after admin-tool edits to a level row;
   * otherwise the next read picks up the new data after TTL.
   */
  invalidate(): void {
    this.bunnyLoadedAt = 0
    this.clickLoadedAt = 0
    this.energyLoadedAt = 0
  }

  private isFresh(loadedAt: number): boolean {
    return Date.now() - loadedAt < LEVELS_CACHE_TTL_MS
  }

  private refreshBunny(): Promise<ClickerLevel[]> {
    if (this.bunnyRefresh) return this.bunnyRefresh
    this.bunnyRefresh = this.bunnyLevelsService
      .findAll()
      .then(rows => {
        const sorted = [...rows].sort((a, b) => a.id - b.id)
        this.bunnyLevels = sorted
        this.bunnyLoadedAt = Date.now()
        return sorted
      })
      .finally(() => {
        this.bunnyRefresh = null
      })
    return this.bunnyRefresh
  }

  private refreshClick(): Promise<ClickerClickLevel[]> {
    if (this.clickRefresh) return this.clickRefresh
    this.clickRefresh = this.clickLevelsService
      .findAll()
      .then(rows => {
        const sorted = [...rows].sort((a, b) => a.id - b.id)
        this.clickLevels = sorted
        this.clickLoadedAt = Date.now()
        return sorted
      })
      .finally(() => {
        this.clickRefresh = null
      })
    return this.clickRefresh
  }

  private refreshEnergy(): Promise<ClickerEnergyLevel[]> {
    if (this.energyRefresh) return this.energyRefresh
    this.energyRefresh = this.energyLevelsService
      .findAll()
      .then(rows => {
        const sorted = [...rows].sort((a, b) => a.id - b.id)
        this.energyLevels = sorted
        this.energyLoadedAt = Date.now()
        return sorted
      })
      .finally(() => {
        this.energyRefresh = null
      })
    return this.energyRefresh
  }
}
