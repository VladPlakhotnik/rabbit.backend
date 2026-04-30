import { Controller, Get, Post, Query, Param, UseGuards } from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger'
import { AuthGuard } from '@nestjs/passport'
import { CsgoSkinService, SkinFilters } from './csgo/csgo-skin.service'
import { CsgoSyncService } from './csgo/csgo-sync.service'
import { DotaSkinService, DotaSkinFilters } from './dota/dota-skin.service'
import { DotaSyncService } from './dota/dota-sync.service'
import { Roles } from '../../core/decorators/roles.decorator'
import { RolesGuard } from '../../core/guards/roles.guard'

// HTTP surface for the CSGO skin module.
//
// Public endpoints (paginated catalog, search, single-item lookup) are
// reachable without auth — the case page and the upgrade market both
// hit them. Admin-only endpoints (manual sync triggers) sit behind a
// JWT + admin role guard so a leaked bearer can't kick off heavyweight
// sync runs.

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
    private readonly skins: CsgoSkinService,
    private readonly sync: CsgoSyncService,
    private readonly dotaSkins: DotaSkinService,
    private readonly dotaSync: DotaSyncService,
  ) {}

  // ---- Public read endpoints ----------------------------------------

  @ApiOperation({ summary: 'Get paginated list of CSGO skins with filters' })
  @ApiResponse({ status: 200, description: 'Paginated skins + total + hasMore flag' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'inStock', required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'itemType', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'minPrice', required: false })
  @ApiQuery({ name: 'maxPrice', required: false })
  @ApiQuery({ name: 'quality', required: false })
  @ApiQuery({ name: 'exterior', required: false })
  @ApiQuery({ name: 'collection', required: false })
  @ApiQuery({ name: 'sortDir', required: false })
  // Two paths for the same handler — `/skins` is the legacy CSGO entry
  // (predates Dota), `/skins/csgo` is the symmetric form that matches
  // `/skins/dota`. Frontend uses `/csgo` for new code; the bare path
  // stays for backwards compat with anything older.
  @Get(['/', '/csgo'])
  async getAllSkins(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('inStock') inStock?: string,
    @Query('category') category?: string,
    @Query('itemType') itemType?: string,
    @Query('search') search?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('quality') quality?: string,
    @Query('exterior') exterior?: string,
    @Query('collection') collection?: string,
    @Query('sortDir') sortDir?: string,
  ) {
    try {
      const filters: SkinFilters = {
        inStock: parseBoolOrUndefined(inStock),
        category,
        itemType,
        search: search?.trim() || undefined,
        minPrice: parseFloatOrUndefined(minPrice),
        maxPrice: parseFloatOrUndefined(maxPrice),
        quality,
        exterior,
        collection,
        sortDir: sortDir === 'asc' || sortDir === 'desc' ? sortDir : undefined,
      }

      const result = await this.skins.findAllPaginated(
        parsePositiveInt(page),
        parsePositiveInt(limit),
        filters,
      )

      return {
        success: true,
        total: result.total,
        page: result.page,
        limit: result.limit,
        hasMore: result.hasMore,
        skins: result.skins,
        filters,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  @ApiOperation({ summary: 'Total count of available CSGO skins' })
  @Get('/status')
  async getTotalSkinsCount() {
    try {
      const { count } = await this.skins.getTotalSkinsCount()
      return { success: true, count, source: 'Database' }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  @ApiOperation({ summary: 'Search for similar skins by market_hash_name' })
  @ApiQuery({ name: 'q', required: true })
  @ApiQuery({ name: 'limit', required: false })
  @Get('/search')
  async searchSkins(@Query('q') q: string, @Query('limit') limit?: string) {
    try {
      const term = q?.trim()

      if (!term) return { success: false, error: 'Search term is required' }

      const skins = await this.skins.searchSimilar(term, parsePositiveInt(limit) ?? 20)
      return { success: true, count: skins.length, searchTerm: term, skins }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  @ApiOperation({ summary: 'Get exact skin by market_hash_name' })
  @ApiParam({ name: 'hashName' })
  @Get('/skin/:hashName')
  async getSkinByHashName(@Param('hashName') hashName: string) {
    try {
      const decoded = decodeURIComponent(hashName ?? '').trim()

      if (!decoded) return { success: false, error: 'Hash name is required' }

      const skin = await this.skins.findByHashName(decoded)

      return skin
        ? { success: true, skin }
        : { success: false, error: 'Skin not found' }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  // ---- Admin-only sync triggers -------------------------------------
  //
  // Sync also runs on cron via SyncSchedulerService; these endpoints
  // exist for ops use ("re-sync now after a marketplace recovery").
  // Guarded by JWT + admin role — without that, a leaked URL could
  // burn a daily DMarket rate-limit budget and cost the project money.

  @ApiOperation({ summary: 'Manually trigger CSGO catalog sync (admin only)' })
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  @Post('/sync-market')
  async syncCatalog() {
    try {
      const report = await this.sync.syncCatalog()
      return { success: report.errors === 0, ...report }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  @ApiOperation({ summary: 'Manually trigger CSGO price sync (admin only)' })
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  @Post('/update-prices')
  async updatePrices() {
    try {
      const report = await this.sync.syncPrices()
      return { success: report.errors === 0, ...report }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  @ApiOperation({ summary: 'Manually trigger CSGO class_instance metadata sync (admin only)' })
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  @Post('/sync-class-instance')
  async syncClassInstance() {
    try {
      const report = await this.sync.syncClassInstanceMetadata()
      return { success: report.errors === 0, ...report }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  // ---- Dota 2 (parallel routes under /skins/dota/...) ---------------
  //
  // Kept under the same controller so Swagger groups them together;
  // a separate `dota-skin.controller.ts` would also work but multiplies
  // module wiring with no real isolation benefit.

  @ApiOperation({ summary: 'Get paginated list of Dota 2 skins with filters' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'inStock', required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'itemType', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'minPrice', required: false })
  @ApiQuery({ name: 'maxPrice', required: false })
  @ApiQuery({ name: 'hero', required: false })
  @ApiQuery({ name: 'rarity', required: false })
  @ApiQuery({ name: 'slot', required: false })
  @ApiQuery({ name: 'quality', required: false })
  @ApiQuery({ name: 'collection', required: false })
  @ApiQuery({ name: 'sortDir', required: false })
  @Get('/dota')
  async getAllDotaSkins(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('inStock') inStock?: string,
    @Query('category') category?: string,
    @Query('itemType') itemType?: string,
    @Query('search') search?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('hero') hero?: string,
    @Query('rarity') rarity?: string,
    @Query('slot') slot?: string,
    @Query('quality') quality?: string,
    @Query('collection') collection?: string,
    @Query('sortDir') sortDir?: string,
  ) {
    try {
      const filters: DotaSkinFilters = {
        inStock: parseBoolOrUndefined(inStock),
        category,
        itemType,
        search: search?.trim() || undefined,
        minPrice: parseFloatOrUndefined(minPrice),
        maxPrice: parseFloatOrUndefined(maxPrice),
        hero,
        rarity,
        slot,
        quality,
        collection,
        sortDir: sortDir === 'asc' || sortDir === 'desc' ? sortDir : undefined,
      }

      const result = await this.dotaSkins.findAllPaginated(
        parsePositiveInt(page),
        parsePositiveInt(limit),
        filters,
      )

      return {
        success: true,
        total: result.total,
        page: result.page,
        limit: result.limit,
        hasMore: result.hasMore,
        skins: result.skins,
        filters,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  @ApiOperation({ summary: 'Get exact Dota 2 skin by market_hash_name' })
  @ApiParam({ name: 'hashName' })
  @Get('/dota/skin/:hashName')
  async getDotaSkinByHashName(@Param('hashName') hashName: string) {
    try {
      const decoded = decodeURIComponent(hashName ?? '').trim()

      if (!decoded) return { success: false, error: 'Hash name is required' }

      const skin = await this.dotaSkins.findByHashName(decoded)

      return skin
        ? { success: true, skin }
        : { success: false, error: 'Skin not found' }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  @ApiOperation({ summary: 'Manually trigger Dota 2 catalog sync (admin only)' })
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  @Post('/dota/sync-market')
  async syncDotaCatalog() {
    try {
      const report = await this.dotaSync.syncCatalog()
      return { success: report.errors === 0, ...report }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  @ApiOperation({ summary: 'Manually trigger Dota 2 price sync (admin only)' })
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  @Post('/dota/update-prices')
  async updateDotaPrices() {
    try {
      const report = await this.dotaSync.syncPrices()
      return { success: report.errors === 0, ...report }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  @ApiOperation({ summary: 'Manually trigger Dota 2 class_instance metadata sync (admin only)' })
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  @Post('/dota/sync-class-instance')
  async syncDotaClassInstance() {
    try {
      const report = await this.dotaSync.syncClassInstanceMetadata()
      return { success: report.errors === 0, ...report }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }
}
