import { Injectable, Logger, Inject, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, In } from 'typeorm'
import { CsgoSkin } from './csgo-skin.entity'
import axios, { AxiosResponse } from 'axios'
import * as crypto from 'crypto'
import {
  DMarketSkinInfo,
  DMarketApiResponse,
  SyncResult,
  RateLimitInfo,
  BatchUpdateResult,
  SkinUpdateData,
} from './types/dmarket.types'
import {
  DMarketConfig,
  DEFAULT_DMARKET_CONFIG,
  CS2_GAME_ID,
  USD_CURRENCY,
  PROGRESS_LOG_INTERVAL,
} from './config/skin-sync.config'
import { RateLimiterService } from './services/rate-limiter.service'
import { RetryService } from './services/retry.service'

/**
 * Service for synchronizing CS2 skins data with DMarket API
 * Handles rate limiting, retry logic, and batch operations for optimal performance
 */
@Injectable()
export class SkinService {
  private readonly logger = new Logger(SkinService.name)
  private readonly config: DMarketConfig

  // Constants
  private static readonly EXTRA_DELAY_MS = 2000

  constructor(
    @InjectRepository(CsgoSkin)
    private readonly csgoSkinRepository: Repository<CsgoSkin>,
    private readonly rateLimiter: RateLimiterService,
    private readonly retryService: RetryService,
    @Inject('DMARKET_CONFIG') @Optional() config?: DMarketConfig,
  ) {
    this.config = config || DEFAULT_DMARKET_CONFIG
    this.validateConfiguration()
  }

  /**
   * Validates the configuration for required fields
   */
  private validateConfiguration(): void {
    if (!this.config.apiKey || !this.config.secretKey) {
      throw new Error(
        'DMarket API credentials not configured. Please set DMARKET_API_KEY and DMARKET_SECRET_KEY environment variables.',
      )
    }
  }

  /**
   * Maps DMarket skin data to update data structure
   * @param skinId - The ID of the skin to update
   * @param marketItem - The market item data from DMarket API
   * @returns Update data object or null if no updates needed
   */
  private mapSkinDataToUpdate(
    skinId: number,
    marketItem: DMarketSkinInfo,
  ): SkinUpdateData | null {
    const updateData: SkinUpdateData = { id: skinId }
    let hasUpdates = false

    // Map all possible fields from the actual DMarket API structure
    const fieldMappings = [
      { source: marketItem.image, target: 'image' },
      { source: marketItem.extra.inspectInGame, target: 'inspect_in_game' },
      { source: marketItem.extra.quality, target: 'quality' },
      { source: marketItem.extra.exterior, target: 'exterior' },
      { source: marketItem.extra.category, target: 'category' },
      { source: marketItem.slug, target: 'slug' },
      { source: marketItem.extra.nameColor, target: 'name_color' },
      { source: marketItem.extra.backgroundColor, target: 'background_color' },
      { source: marketItem.extra.itemType, target: 'item_type' },
      { source: marketItem.extra.collection, target: 'collection' },
      { source: marketItem.extra.name, target: 'name' },
      { source: marketItem.extra.floatPartValue, target: 'float_part_value' },
    ]

    // Handle string fields
    fieldMappings.forEach(({ source, target }) => {
      if (source) {
        ;(updateData as any)[target] = source
        hasUpdates = true
      }
    })

    // Handle numeric fields
    if (marketItem.extra.floatValue !== undefined) {
      updateData.float_value = marketItem.extra.floatValue
      hasUpdates = true
    }
    if (marketItem.extra.paintSeed !== undefined) {
      updateData.pattern = marketItem.extra.paintSeed
      hasUpdates = true
    }

    return hasUpdates ? updateData : null
  }

  /**
   * Generates HMAC-SHA256 signature for DMarket API authentication
   */
  private generateSignature(
    method: string,
    path: string,
    body: string,
    timestamp: string,
  ): string {
    const message = method + path + body + timestamp
    return crypto
      .createHmac('sha256', this.config.secretKey)
      .update(message)
      .digest('hex')
  }

  /**
   * Generates authentication headers for DMarket API requests
   */
  private getDMarketHeaders(
    method: string,
    path: string,
    body: string = '',
  ): Record<string, string> {
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const signature = this.generateSignature(method, path, body, timestamp)

    return {
      'X-Api-Key': this.config.apiKey,
      'X-Sign-Date': timestamp,
      'X-Request-Sign': signature,
      'Content-Type': 'application/json',
    }
  }

  /**
   * Fetches a single page of CS2 skins from DMarket API with pagination
   */
  async getCS2SkinsList(cursor?: string): Promise<DMarketApiResponse> {
    return this.retryService.executeWithRetry(
      async () => {
        // Wait for rate limit before making request
        await this.rateLimiter.waitForRateLimit()

        const path = this.buildApiPath(cursor)
        this.logger.debug(`Making API request to: ${path}`)

        const response: AxiosResponse<DMarketApiResponse> = await axios.get(
          `${this.config.baseUrl}${path}`,
          { headers: this.getDMarketHeaders('GET', path) },
        )

        if (response.data?.objects) {
          this.logger.debug(
            `Fetched ${response.data.objects.length} CS2 skins from DMarket`,
          )
          return response.data
        }

        return { objects: [], cursor: null }
      },
      this.config.retryAttempts,
      this.config.retryDelay,
      'DMarket API request',
    )
  }

  /**
   * Builds the API path with query parameters
   */
  private buildApiPath(cursor?: string): string {
    let path = `/exchange/v1/market/items?gameId=${CS2_GAME_ID}&limit=${this.config.batchSize}&orderBy=price&orderDir=desc&currency=${USD_CURRENCY}`

    if (cursor) {
      path += `&cursor=${encodeURIComponent(cursor)}`
    }

    return path
  }

  /**
   * Fetches all CS2 skins from DMarket API with pagination
   */
  async getAllCS2SkinsList(): Promise<DMarketSkinInfo[]> {
    try {
      this.logger.log('Starting to fetch all CS2 skins from DMarket...')
      this.logger.log(
        `Rate limit: ${this.config.maxRequestsPerMinute} requests per minute`,
      )

      const allSkins: DMarketSkinInfo[] = []
      let cursor: string | null = null
      let pageCount = 0
      const startTime = Date.now()

      do {
        pageCount++
        this.logger.log(`Fetching page ${pageCount}...`)

        const response = await this.getCS2SkinsList(cursor || undefined)

        if (response.objects?.length > 0) {
          allSkins.push(...response.objects)
          cursor = response.cursor
          this.logger.log(
            `Page ${pageCount}: Got ${response.objects.length} skins. Total: ${allSkins.length}`,
          )
        } else {
          this.logger.log('No more data available')
          break
        }

        // Log progress every N pages
        if (pageCount % PROGRESS_LOG_INTERVAL === 0) {
          this.logProgress(pageCount, allSkins.length, startTime)
        }
      } while (cursor)

      const totalTime = Math.ceil((Date.now() - startTime) / 1000)
      this.logger.log(
        `Finished fetching all skins. Total: ${allSkins.length} skins from ${pageCount} pages in ${totalTime} seconds`,
      )

      return allSkins
    } catch (error) {
      this.handleError(error, 'Error fetching all CS2 skins from DMarket')
      return []
    }
  }

  /**
   * Logs progress information
   */
  private logProgress(
    pageCount: number,
    totalSkins: number,
    startTime: number,
  ): void {
    const elapsed = Date.now() - startTime
    const avgTimePerPage = elapsed / pageCount
    this.logger.log(
      `Progress: ${pageCount} pages completed. Total skins: ${totalSkins}. Average time per page: ${Math.ceil(
        avgTimePerPage / 1000,
      )} seconds`,
    )
  }

  /**
   * Synchronizes skin data for CS:GO skins with pagination and batch processing
   */
  async syncSkinMarket(startCursor?: string): Promise<SyncResult> {
    try {
      this.logger.log('Starting skin data synchronization with pagination...')
      this.logger.log(
        `Rate limit: ${this.config.maxRequestsPerMinute} requests per minute`,
      )

      const skins = await this.getSkins()

      if (skins.length === 0) {
        this.logger.log('No skins found')
        return { success: true, updated: 0, errors: 0, pagesProcessed: 0 }
      }

      const result = await this.processSkinsInBatches(skins, startCursor)

      this.logger.log(
        `Data synchronization completed. Pages processed: ${result.pagesProcessed}, Total updated: ${result.updated}, Total errors: ${result.errors}`,
      )

      return result
    } catch (error) {
      this.handleError(error, 'Error during skin data synchronization')
      return { success: false, updated: 0, errors: 1, pagesProcessed: 0 }
    }
  }

  /**
   * Gets all skins from database for synchronization
   */
  private async getSkins(): Promise<CsgoSkin[]> {
    return this.csgoSkinRepository.find({
      select: ['id', 'market_hash_name'],
    })
  }

  /**
   * Processes skins in batches for better performance
   */
  private async processSkinsInBatches(
    initialSkins: CsgoSkin[],
    startCursor?: string,
  ): Promise<SyncResult> {
    let allUpdated = 0
    let allErrors = 0
    let pageCount = 0
    let cursor: string | null = startCursor || null
    const startTime = Date.now()

    // Create a Set for faster lookups
    const skinIds = new Set(initialSkins.map(skin => skin.id))
    const updatedSkins = new Set<number>()

    if (startCursor) {
      this.logger.log(`Starting from cursor: ${startCursor}`)
    }

    this.logger.log(`Starting with ${skinIds.size} skins for processing`)

    // Process each page separately
    do {
      pageCount++
      this.logger.log(`Processing page ${pageCount}...`)

      const response = await this.getCS2SkinsList(cursor || undefined)

      if (!response.objects?.length) {
        this.logger.log('No more data available from API')
        break
      }

      this.logger.log(
        `Page ${pageCount}: Processing ${response.objects.length} market items`,
      )

      const batchResult = await this.processBatchWithTracking(
        skinIds,
        updatedSkins,
        response.objects,
      )
      allUpdated += batchResult.updated
      allErrors += batchResult.errors

      this.logger.log(
        `Page ${pageCount} completed: Updated ${batchResult.updated}, Errors ${batchResult.errors}. Total skins processed: ${skinIds.size}`,
      )

      // Continue processing all skins regardless of update status
      // This ensures we check all skins for potential updates

      // Add extra delay if no updates were made
      if (batchResult.updated === 0) {
        this.logger.log('No updates on this page, adding extra delay...')
        await this.delay(SkinService.EXTRA_DELAY_MS)
      }

      cursor = response.cursor

      // Log progress every N pages
      if (pageCount % PROGRESS_LOG_INTERVAL === 0) {
        this.logProgress(pageCount, allUpdated, startTime)
      }
    } while (cursor)

    const totalTime = Math.ceil((Date.now() - startTime) / 1000)

    return {
      success: true,
      updated: allUpdated,
      errors: allErrors,
      pagesProcessed: pageCount,
      lastCursor: cursor || undefined,
      totalTime,
    }
  }

  /**
   * Processes a batch of skins against market data with tracking
   */
  private async processBatchWithTracking(
    skins: Set<number>,
    updatedSkins: Set<number>,
    marketItems: DMarketSkinInfo[],
  ): Promise<BatchUpdateResult> {
    let updated = 0
    let errors = 0

    // Create a map for faster lookups
    const marketMap = new Map(marketItems.map(item => [item.title, item]))

    // Get all current skins from database for processing
    const currentSkins = await this.csgoSkinRepository.find({
      where: {
        id: In(Array.from(skins)),
      },
      select: ['id', 'market_hash_name'],
    })

    // Process all skins at once using the same batch size as API requests
    const batchResult = await this.updateBatchSkinData(
      currentSkins,
      marketMap,
      updatedSkins,
    )
    updated += batchResult.updated
    errors += batchResult.errors

    return { updated, errors, processed: currentSkins.length }
  }

  /**
   * Updates skin data for a batch of skins with tracking
   */
  private async updateBatchSkinData(
    skins: CsgoSkin[],
    marketMap: Map<string, DMarketSkinInfo>,
    updatedSkins: Set<number>,
  ): Promise<BatchUpdateResult> {
    let updated = 0
    let errors = 0

    const updates: SkinUpdateData[] = []

    for (const skin of skins) {
      try {
        // Skip if already updated in this session
        if (updatedSkins.has(skin.id)) {
          continue
        }

        const matchingItem = marketMap.get(skin.market_hash_name)

        if (matchingItem) {
          const updateData = this.mapSkinDataToUpdate(skin.id, matchingItem)
          if (updateData) {
            updates.push(updateData)
          }
        }
      } catch (error) {
        errors++
        this.handleError(
          error,
          `Error processing skin ${skin.market_hash_name}`,
        )
      }
    }

    // Perform batch update if there are updates to make
    if (updates.length > 0) {
      try {
        // Process updates in batches using config batch size
        const batchSize = this.config.batchSize
        for (let i = 0; i < updates.length; i += batchSize) {
          const updateBatch = updates.slice(i, i + batchSize)
          await this.performBatchUpdate(updateBatch)
        }

        updated = updates.length

        // Track updated skins
        updates.forEach(({ id }) => {
          updatedSkins.add(id)
          // Don't remove from skins set - we want to process all skins
        })

        this.logger.log(`Batch updated ${updated} skins with data`)
      } catch (error) {
        errors += updates.length
        this.handleError(error, 'Error performing batch update')
      }
    }

    return { updated, errors, processed: skins.length }
  }

  /**
   * Performs batch update of skin data
   */
  private async performBatchUpdate(updates: SkinUpdateData[]): Promise<void> {
    // Use Promise.all for concurrent updates
    await Promise.all(
      updates.map(({ id, ...dataToUpdate }) => {
        return this.csgoSkinRepository.update(id, dataToUpdate)
      }),
    )
  }

  /**
   * Gets total count of skins in database (only with complete data)
   */
  async getTotalSkinsCount(): Promise<{ count: number }> {
    const count = await this.csgoSkinRepository
      .createQueryBuilder('skin')
      .where('skin.image IS NOT NULL AND skin.image != :emptyString', {
        emptyString: '',
      })
      .andWhere('skin.market_price IS NOT NULL AND skin.market_price > 0')
      .andWhere('skin.name IS NOT NULL AND skin.name != :emptyString', {
        emptyString: '',
      })
      .getCount()

    this.logger.log(`Found ${count} total skins with complete data in database`)
    return { count }
  }

  /**
   * Gets current rate limit information
   */
  async getRateLimitInfo(): Promise<RateLimitInfo> {
    return this.rateLimiter.getRateLimitInfo()
  }

  /**
   * Resets rate limiter state
   */
  resetRateLimiter(): void {
    this.rateLimiter.reset()
  }

  /**
   * Search for similar skins by market_hash_name
   */
  async searchSimilarSkins(
    searchTerm: string,
    limit: number = 20,
  ): Promise<CsgoSkin[]> {
    return this.csgoSkinRepository
      .createQueryBuilder('skin')
      .select([
        'skin.id',
        'skin.market_hash_name',
        'skin.market_price',
        'skin.image',
        'skin.quality',
        'skin.exterior',
        'skin.category',
        'skin.item_type',
      ])
      .where('skin.market_hash_name ILIKE :searchTerm', {
        searchTerm: `%${searchTerm}%`,
      })
      .orderBy('skin.market_price', 'DESC')
      .limit(limit)
      .getMany()
  }

  /**
   * Search for exact skin by market_hash_name
   */
  async findSkinByHashName(hashName: string): Promise<CsgoSkin | null> {
    return this.csgoSkinRepository.findOne({
      where: { market_hash_name: hashName },
      select: [
        'id',
        'market_hash_name',
        'market_price',
        'image',
        'quality',
        'exterior',
        'category',
        'item_type',
        'collection',
        'float_value',
        'pattern',
      ],
    })
  }

  /**
   * Get skins from database with pagination and filters for infinite scroll
   */
  async getAllSkinsFromDatabase(
    page: number = 1,
    limit: number = 100,
    filters?: {
      inStock?: boolean
      game?: string
      category?: string
      itemType?: string
      search?: string
      minPrice?: number
      maxPrice?: number
      quality?: string
      exterior?: string
      collection?: string
    },
  ): Promise<{
    skins: CsgoSkin[]
    total: number
    page: number
    limit: number
    hasMore: boolean
  }> {
    const queryBuilder = this.csgoSkinRepository.createQueryBuilder('skin')

    // Select all necessary fields
    queryBuilder.select([
      'skin.id',
      'skin.market_hash_name',
      'skin.market_price',
      'skin.image',
      'skin.quality',
      'skin.exterior',
      'skin.category',
      'skin.item_type',
      'skin.collection',
      'skin.float_value',
      'skin.pattern',
      'skin.name',
      'skin.slug',
      'skin.name_color',
      'skin.background_color',
      'skin.inspect_in_game',
      'skin.is_new',
      'skin.amount_in_market',
      'skin.created_at',
      'skin.updated_at',
    ])

    // Always filter by required fields (image, market_price, name)
    queryBuilder.andWhere(
      'skin.image IS NOT NULL AND skin.image != :emptyString',
      {
        emptyString: '',
      },
    )
    queryBuilder.andWhere(
      'skin.market_price IS NOT NULL AND skin.market_price > 0',
    )
    queryBuilder.andWhere(
      'skin.name IS NOT NULL AND skin.name != :emptyString',
      {
        emptyString: '',
      },
    )

    // Apply additional filters
    if (filters) {
      // Filter by stock availability (amount_in_market > 0)
      if (filters.inStock === true) {
        queryBuilder.andWhere(
          'skin.amount_in_market != :empty AND skin.amount_in_market != :zero',
          {
            empty: '',
            zero: '0',
          },
        )
      }

      // Filter by game (assuming CS2 for now, can be extended)
      if (filters.game) {
        // For now, all skins are CS2, but this can be extended
        if (filters.game !== 'CS2') {
          queryBuilder.andWhere('1 = 0') // No results for non-CS2 games
        }
      }

      // Filter by category
      if (filters.category) {
        queryBuilder.andWhere('skin.category = :category', {
          category: filters.category,
        })
      }

      // Filter by item type
      if (filters.itemType) {
        queryBuilder.andWhere('skin.item_type = :itemType', {
          itemType: filters.itemType,
        })
      }

      // Search by name or market hash name
      if (filters.search) {
        queryBuilder.andWhere(
          '(skin.name ILIKE :search OR skin.market_hash_name ILIKE :search)',
          { search: `%${filters.search}%` },
        )
      }

      // Filter by price range
      if (filters.minPrice !== undefined) {
        queryBuilder.andWhere('skin.market_price >= :minPrice', {
          minPrice: filters.minPrice,
        })
      }

      if (filters.maxPrice !== undefined) {
        queryBuilder.andWhere('skin.market_price <= :maxPrice', {
          maxPrice: filters.maxPrice,
        })
      }

      // Filter by quality
      if (filters.quality) {
        queryBuilder.andWhere('skin.quality = :quality', {
          quality: filters.quality,
        })
      }

      // Filter by exterior
      if (filters.exterior) {
        queryBuilder.andWhere('skin.exterior = :exterior', {
          exterior: filters.exterior,
        })
      }

      // Filter by collection
      if (filters.collection) {
        queryBuilder.andWhere('skin.collection ILIKE :collection', {
          collection: `%${filters.collection}%`,
        })
      }
    }

    // Order by price descending
    queryBuilder.orderBy('skin.market_price', 'DESC')

    // Apply pagination
    queryBuilder.skip((page - 1) * limit).take(limit)

    const [skins, total] = await queryBuilder.getManyAndCount()

    // Calculate if there are more items
    const hasMore = page * limit < total

    return {
      skins,
      total,
      page,
      limit,
      hasMore,
    }
  }

  /**
   * Get available filter options for the shop
   */
  async getFilterOptions(): Promise<{
    categories: string[]
    itemTypes: string[]
    qualities: string[]
    exteriors: string[]
    collections: string[]
  }> {
    const [categories, itemTypes, qualities, exteriors, collections] =
      await Promise.all([
        this.csgoSkinRepository
          .createQueryBuilder('skin')
          .select('DISTINCT skin.category', 'category')
          .where('skin.category IS NOT NULL')
          .andWhere('skin.image IS NOT NULL AND skin.image != :emptyString', {
            emptyString: '',
          })
          .andWhere('skin.market_price IS NOT NULL AND skin.market_price > 0')
          .andWhere('skin.name IS NOT NULL AND skin.name != :emptyString', {
            emptyString: '',
          })
          .orderBy('skin.category', 'ASC')
          .getRawMany()
          .then(results => results.map(r => r.category)),

        this.csgoSkinRepository
          .createQueryBuilder('skin')
          .select('DISTINCT skin.item_type', 'itemType')
          .where('skin.item_type IS NOT NULL')
          .andWhere('skin.image IS NOT NULL AND skin.image != :emptyString', {
            emptyString: '',
          })
          .andWhere('skin.market_price IS NOT NULL AND skin.market_price > 0')
          .andWhere('skin.name IS NOT NULL AND skin.name != :emptyString', {
            emptyString: '',
          })
          .orderBy('skin.item_type', 'ASC')
          .getRawMany()
          .then(results => results.map(r => r.itemType)),

        this.csgoSkinRepository
          .createQueryBuilder('skin')
          .select('DISTINCT skin.quality', 'quality')
          .where('skin.quality IS NOT NULL')
          .andWhere('skin.image IS NOT NULL AND skin.image != :emptyString', {
            emptyString: '',
          })
          .andWhere('skin.market_price IS NOT NULL AND skin.market_price > 0')
          .andWhere('skin.name IS NOT NULL AND skin.name != :emptyString', {
            emptyString: '',
          })
          .orderBy('skin.quality', 'ASC')
          .getRawMany()
          .then(results => results.map(r => r.quality)),

        this.csgoSkinRepository
          .createQueryBuilder('skin')
          .select('DISTINCT skin.exterior', 'exterior')
          .where('skin.exterior IS NOT NULL')
          .andWhere('skin.image IS NOT NULL AND skin.image != :emptyString', {
            emptyString: '',
          })
          .andWhere('skin.market_price IS NOT NULL AND skin.market_price > 0')
          .andWhere('skin.name IS NOT NULL AND skin.name != :emptyString', {
            emptyString: '',
          })
          .orderBy('skin.exterior', 'ASC')
          .getRawMany()
          .then(results => results.map(r => r.exterior)),

        this.csgoSkinRepository
          .createQueryBuilder('skin')
          .select('DISTINCT skin.collection', 'collection')
          .where('skin.collection IS NOT NULL')
          .andWhere('skin.image IS NOT NULL AND skin.image != :emptyString', {
            emptyString: '',
          })
          .andWhere('skin.market_price IS NOT NULL AND skin.market_price > 0')
          .andWhere('skin.name IS NOT NULL AND skin.name != :emptyString', {
            emptyString: '',
          })
          .orderBy('skin.collection', 'ASC')
          .getRawMany()
          .then(results => results.map(r => r.collection)),
      ])

    return {
      categories,
      itemTypes,
      qualities,
      exteriors,
      collections,
    }
  }

  /**
   * Get price range for filtering
   */
  async getPriceRange(): Promise<{ minPrice: number; maxPrice: number }> {
    const result = await this.csgoSkinRepository
      .createQueryBuilder('skin')
      .select('MIN(skin.market_price)', 'minPrice')
      .addSelect('MAX(skin.market_price)', 'maxPrice')
      .where('skin.image IS NOT NULL AND skin.image != :emptyString', {
        emptyString: '',
      })
      .andWhere('skin.market_price IS NOT NULL AND skin.market_price > 0')
      .andWhere('skin.name IS NOT NULL AND skin.name != :emptyString', {
        emptyString: '',
      })
      .getRawOne()

    return {
      minPrice: parseFloat(result.minPrice) || 0,
      maxPrice: parseFloat(result.maxPrice) || 0,
    }
  }

  /**
   * Utility method for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Handles errors with proper logging and context
   */
  private handleError(error: unknown, context: string): void {
    if (error instanceof Error) {
      this.logger.error(`${context}: ${error.message}`, error.stack)
    } else {
      this.logger.error(`${context}: Unknown error`, error)
    }
  }
}
