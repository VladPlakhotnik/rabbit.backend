import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, LessThan } from 'typeorm'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'
import { CsgoSkin } from './csgo-skin.entity'

interface MarketCsgoItem {
  market_hash_name: string
  volume: string
  price: string
}

interface MarketCsgoResponse {
  success: boolean
  time: number
  currency: string
  items: MarketCsgoItem[]
}

/**
 * Service for synchronizing CS2 skins data with market.csgo.com API
 * Handles price updates and synchronization for existing skins in database
 */
@Injectable()
export class SkinSyncService {
  private readonly logger = new Logger(SkinSyncService.name)
  private readonly MARKET_CSGO_API_URL =
    'https://market.csgo.com/api/v2/prices/USD.json'

  constructor(
    @InjectRepository(CsgoSkin)
    private readonly csgoSkinRepository: Repository<CsgoSkin>,
    private readonly httpService: HttpService,
  ) {}

  /**
   * Updates prices for all skins in database from market.csgo.com API
   * Also creates new skins if they don't exist in database
   */
  async updateSkinsPrices(): Promise<{
    updated: number
    created: number
    errors: number
  }> {
    this.logger.log('Starting skins prices update from market.csgo.com')

    let updated = 0
    let created = 0
    let errors = 0

    try {
      // Get all skins from database
      const existingSkins = await this.csgoSkinRepository.find()
      this.logger.log(`Found ${existingSkins.length} skins in database`)

      // Fetch prices from market.csgo.com API
      const marketData = await this.fetchMarketPrices()

      if (!marketData.success || !marketData.items) {
        throw new Error('Invalid response from market.csgo.com API')
      }

      this.logger.log(
        `Fetched ${marketData.items.length} items from market.csgo.com`,
      )

      // Create a map for faster lookup of existing skins
      const existingSkinsMap = new Map<string, CsgoSkin>()
      existingSkins.forEach(skin => {
        existingSkinsMap.set(skin.market_hash_name, skin)
      })

      // Process all market items
      for (const marketItem of marketData.items) {
        try {
          const existingSkin = existingSkinsMap.get(marketItem.market_hash_name)
          const newPrice = parseFloat(marketItem.price)

          if (existingSkin) {
            // Always update price and market data
            const updateData: Partial<CsgoSkin> = {
              market_price: newPrice,
              amount_in_market: marketItem.volume,
              updated_at: new Date(),
            }

            // Check if skin is older than 10 days and set is_new to false
            const tenDaysAgo = new Date()
            tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)

            const shouldUpdateIsNew =
              existingSkin.is_new && existingSkin.created_at < tenDaysAgo

            // Set is_new to false if skin is older than 10 days
            if (shouldUpdateIsNew) {
              updateData.is_new = false
              this.logger.debug(
                `Setting is_new to false for ${marketItem.market_hash_name} (older than 10 days)`,
              )
            }

            await this.csgoSkinRepository.update(existingSkin.id, updateData)

            this.logger.debug(
              `Updated price for ${marketItem.market_hash_name}: ${existingSkin.market_price} -> ${newPrice}`,
            )
            updated++
          } else {
            const newSkin = this.csgoSkinRepository.create({
              market_hash_name: marketItem.market_hash_name,
              market_price: newPrice,
              amount_in_market: marketItem.volume,
              is_new: true,
            })

            await this.csgoSkinRepository.save(newSkin)

            this.logger.debug(
              `Created new skin: ${marketItem.market_hash_name} with price: ${newPrice}`,
            )
            created++
          }
        } catch (error) {
          this.logger.error(
            `Error processing skin ${marketItem.market_hash_name}:`,
            error,
          )
          errors++
        }
      }

      this.logger.log(
        `Price update completed. Updated: ${updated}, Created: ${created}, Errors: ${errors}`,
      )
    } catch (error) {
      this.logger.error('Failed to update skins prices:', error)
      throw error
    }

    return { updated, created, errors }
  }

  /**
   * Fetches prices from market.csgo.com API
   */
  private async fetchMarketPrices(): Promise<MarketCsgoResponse> {
    try {
      this.logger.log('Fetching prices from market.csgo.com API')

      const response = await firstValueFrom(
        this.httpService.get<MarketCsgoResponse>(this.MARKET_CSGO_API_URL, {
          timeout: 30000, // 30 seconds timeout
          headers: {
            'User-Agent': 'Droplock-Backend/1.0',
          },
        }),
      )

      return response.data
    } catch (error) {
      this.logger.error('Failed to fetch market prices:', error)
      throw new Error(
        `Failed to fetch market prices: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
    }
  }
}
