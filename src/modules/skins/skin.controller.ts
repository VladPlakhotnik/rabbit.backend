import { Controller, Get, Post, Body, Query, Param } from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger'
import { SkinService } from './skin.service'
import { SkinSyncService } from './skins-sync'

// Coerce a query-string value to a positive integer. Returns `undefined` for
// missing / empty / non-numeric / non-positive values so the service-side
// defaults can take over instead of receiving NaN.
const parsePositiveInt = (raw: string | undefined): number | undefined => {
  if (raw === undefined || raw === '') return undefined
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

const parseFloatOrUndefined = (raw: string | undefined): number | undefined => {
  if (raw === undefined || raw === '') return undefined
  const parsed = Number.parseFloat(raw)
  return Number.isFinite(parsed) ? parsed : undefined
}

const parseBoolOrUndefined = (raw: string | undefined): boolean | undefined => {
  if (raw === undefined || raw === '') return undefined
  if (raw === 'true' || raw === '1') return true
  if (raw === 'false' || raw === '0') return false
  return undefined
}

@ApiTags('skins')
@Controller('skins')
export class SkinController {
  constructor(
    private readonly marketSkinSyncService: SkinService,
    private readonly skinSyncService: SkinSyncService,
  ) {}

  @ApiOperation({
    summary: 'Get all skins from database with pagination and filters',
  })
  @ApiResponse({
    status: 200,
    description: 'Return paginated list of skins with filters applied',
  })
  @ApiQuery({ name: 'page', description: 'Page number', required: false })
  @ApiQuery({
    name: 'limit',
    description: 'Number of items per page',
    required: false,
  })
  @ApiQuery({
    name: 'inStock',
    description: 'Filter by availability (true = in stock only)',
    required: false,
  })
  @ApiQuery({
    name: 'game',
    description: 'Filter by game (CS2, Dota 2)',
    required: false,
  })
  @ApiQuery({
    name: 'category',
    description: 'Filter by category',
    required: false,
  })
  @ApiQuery({
    name: 'itemType',
    description: 'Filter by item type',
    required: false,
  })
  @ApiQuery({
    name: 'search',
    description: 'Search by name or market hash name',
    required: false,
  })
  @ApiQuery({
    name: 'minPrice',
    description: 'Minimum price filter',
    required: false,
  })
  @ApiQuery({
    name: 'maxPrice',
    description: 'Maximum price filter',
    required: false,
  })
  @ApiQuery({
    name: 'quality',
    description: 'Filter by quality (FN, MW, FT, WW, BS)',
    required: false,
  })
  @ApiQuery({
    name: 'exterior',
    description: 'Filter by exterior',
    required: false,
  })
  @ApiQuery({
    name: 'collection',
    description: 'Filter by collection',
    required: false,
  })
  @Get('/')
  async getAllSkins(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('inStock') inStock?: string,
    @Query('game') game?: string,
    @Query('category') category?: string,
    @Query('itemType') itemType?: string,
    @Query('search') search?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('quality') quality?: string,
    @Query('exterior') exterior?: string,
    @Query('collection') collection?: string,
  ) {
    try {
      // Query strings always arrive as `string | undefined`. Coerce to the
      // shapes the service expects, treating empty / non-numeric values as
      // "not set" so callers don't have to worry about `?page=&limit=` style
      // empty strings. Default page/limit kicks in inside the service.
      const parsedPage = parsePositiveInt(page)
      const parsedLimit = parsePositiveInt(limit)
      const parsedMinPrice = parseFloatOrUndefined(minPrice)
      const parsedMaxPrice = parseFloatOrUndefined(maxPrice)
      const parsedInStock = parseBoolOrUndefined(inStock)
      const trimmedSearch = search && search.trim() !== '' ? search.trim() : undefined

      const filters = {
        inStock: parsedInStock,
        game,
        category,
        itemType,
        search: trimmedSearch,
        minPrice: parsedMinPrice,
        maxPrice: parsedMaxPrice,
        quality,
        exterior,
        collection,
      }

      const cleanFilters = Object.fromEntries(
        Object.entries(filters).filter(([_, value]) => value !== undefined),
      )

      const result = await this.marketSkinSyncService.getAllSkinsFromDatabase(
        parsedPage,
        parsedLimit,
        Object.keys(cleanFilters).length > 0 ? cleanFilters : undefined,
      )

      return {
        success: true,
        total: result.total,
        page: result.page,
        limit: result.limit,
        hasMore: result.hasMore,
        skins: result.skins,
        filters: cleanFilters,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  @Post('/sync-market')
  async syncSkinData(@Body() body?: { startCursor?: string }) {
    try {
      const result = await this.marketSkinSyncService.syncSkinMarket(
        body?.startCursor,
      )
      return {
        success: result.success,
        message: result.success
          ? `Synchronization completed. Pages processed: ${result.pagesProcessed}, Updated: ${result.updated}, Errors: ${result.errors}`
          : 'Synchronization failed',
        updated: result.updated,
        errors: result.errors,
        pagesProcessed: result.pagesProcessed,
        lastCursor: result.lastCursor,
        source: 'DMarket API',
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        source: 'DMarket API',
      }
    }
  }

  @Get('/status')
  async getTotalSkinsCount() {
    try {
      const count = await this.marketSkinSyncService.getTotalSkinsCount()
      return {
        success: true,
        count: count,
        source: 'Database',
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        source: 'Database',
      }
    }
  }

  @Post('/update-prices')
  async updatePrices() {
    try {
      const result = await this.skinSyncService.updateSkinsPrices()
      return {
        success: true,
        message: `Prices updated successfully. Updated: ${result.updated}, Created: ${result.created}, Errors: ${result.errors}`,
        updated: result.updated,
        created: result.created,
        errors: result.errors,
        source: 'Market.csgo.com API',
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        source: 'Market.csgo.com API',
      }
    }
  }

  @ApiOperation({ summary: 'Search for similar skins by market_hash_name' })
  @ApiResponse({ status: 200, description: 'Return similar skins' })
  @ApiQuery({ name: 'q', description: 'Search term', required: true })
  @ApiQuery({
    name: 'limit',
    description: 'Maximum number of results',
    required: false,
  })
  @Get('/search')
  async searchSkins(
    @Query('q') searchTerm: string,
    @Query('limit') limit?: string,
  ) {
    try {
      if (!searchTerm || searchTerm.trim().length === 0) {
        return {
          success: false,
          error: 'Search term is required',
          source: 'Database',
        }
      }

      const parsedLimit = parsePositiveInt(limit) ?? 20

      const skins = await this.marketSkinSyncService.searchSimilarSkins(
        searchTerm.trim(),
        parsedLimit,
      )

      return {
        success: true,
        count: skins.length,
        searchTerm: searchTerm.trim(),
        skins: skins,
        source: 'Database',
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        source: 'Database',
      }
    }
  }

  @ApiOperation({ summary: 'Get exact skin by market_hash_name' })
  @ApiResponse({ status: 200, description: 'Return skin details' })
  @ApiParam({ name: 'hashName', description: 'Market hash name of the skin' })
  @Get('/skin/:hashName')
  async getSkinByHashName(@Param('hashName') hashName: string) {
    try {
      if (!hashName || hashName.trim().length === 0) {
        return {
          success: false,
          error: 'Hash name is required',
          source: 'Database',
        }
      }

      const skin = await this.marketSkinSyncService.findSkinByHashName(
        decodeURIComponent(hashName.trim()),
      )

      if (!skin) {
        return {
          success: false,
          error: 'Skin not found',
          source: 'Database',
        }
      }

      return {
        success: true,
        skin: skin,
        source: 'Database',
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        source: 'Database',
      }
    }
  }

  @Get('/dmarket')
  async getDMarketSkinsList() {
    try {
      const count = await this.marketSkinSyncService.getCS2SkinsList()
      return {
        success: true,
        count: count,
        source: 'Database',
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        source: 'Database',
      }
    }
  }
}
