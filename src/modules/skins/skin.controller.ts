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
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('inStock') inStock?: boolean,
    @Query('game') game?: string,
    @Query('category') category?: string,
    @Query('itemType') itemType?: string,
    @Query('search') search?: string,
    @Query('minPrice') minPrice?: number,
    @Query('maxPrice') maxPrice?: number,
    @Query('quality') quality?: string,
    @Query('exterior') exterior?: string,
    @Query('collection') collection?: string,
  ) {
    try {
      const filters = {
        inStock,
        game,
        category,
        itemType,
        search,
        minPrice,
        maxPrice,
        quality,
        exterior,
        collection,
      }

      // Remove undefined values
      const cleanFilters = Object.fromEntries(
        Object.entries(filters).filter(([_, value]) => value !== undefined),
      )

      const result = await this.marketSkinSyncService.getAllSkinsFromDatabase(
        page,
        limit,
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
    @Query('limit') limit?: number,
  ) {
    try {
      if (!searchTerm || searchTerm.trim().length === 0) {
        return {
          success: false,
          error: 'Search term is required',
          source: 'Database',
        }
      }

      const skins = await this.marketSkinSyncService.searchSimilarSkins(
        searchTerm.trim(),
        limit || 20,
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
