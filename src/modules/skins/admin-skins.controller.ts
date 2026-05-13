import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { Repository, SelectQueryBuilder } from 'typeorm'
import { AdminMutation } from '../admin/decorators/admin-mutation.decorator'
import { AdminRoles } from '../admin/decorators/admin-roles.decorator'
import { AdminJwtGuard } from '../admin/guards/admin-jwt.guard'
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard'
import { AdminRole } from '../admin/types/admin-role.enum'
import { CsgoSkin } from './csgo-skin.entity'
import { CsgoSkinService } from './csgo/csgo-skin.service'
import { DotaSkin } from './dota-skin.entity'
import { DotaSkinService } from './dota/dota-skin.service'
import {
  CreateAdminSkinDto,
  UpdateAdminSkinDto,
  UpdateAdminSkinStatusDto,
} from './dto/admin-skin.dto'
import { SkinStatus } from './shared/skin-status.enum'

type AdminSkinGame = 'csgo' | 'dota'
type AdminSkinStatus = 'all' | SkinStatus
type AdminSkinSort = 'asc' | 'desc'
type AdminSkinEntity = CsgoSkin | DotaSkin

const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100

const parsePositiveInt = (
  raw: string | undefined,
  fallback: number,
  max = Number.MAX_SAFE_INTEGER,
): number => {
  const parsed = Number.parseInt(raw ?? '', 10)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return Math.min(parsed, max)
}

const parseText = (raw: string | undefined): string | undefined => {
  const value = raw?.trim()
  return value ? value : undefined
}

const parseGame = (raw: string | undefined): AdminSkinGame =>
  raw === 'dota' ? 'dota' : 'csgo'

const parseGameStrict = (raw: string): AdminSkinGame => {
  if (raw === 'csgo' || raw === 'dota') return raw
  throw new BadRequestException('game_type must be csgo or dota')
}

const parseStatus = (raw: string | undefined): AdminSkinStatus => {
  if (
    raw === SkinStatus.Available ||
    raw === SkinStatus.UnavailableOnMarket ||
    raw === SkinStatus.Disabled
  ) {
    return raw
  }
  return 'all'
}

const parseSort = (raw: string | undefined): AdminSkinSort =>
  raw === 'asc' ? 'asc' : 'desc'

const applyBaseSkinFilters = (
  qb: SelectQueryBuilder<AdminSkinEntity>,
  status: AdminSkinStatus,
  search: string | undefined,
): void => {
  qb.where('1 = 1')

  if (status !== 'all') {
    qb.andWhere('skin.status = :status', { status })
  }

  if (search) {
    qb.andWhere(
      '(skin.name ILIKE :search OR skin.market_hash_name ILIKE :search)',
      {
        search: `%${search}%`,
      },
    )
  }
}

const trimText = (value: string | null | undefined): string | null =>
  value?.trim() || null

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 255) || `skin-${Date.now()}`

const parseCollection = (value: string | null | undefined): string[] | null => {
  const text = trimText(value)
  if (!text) return null
  return text
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

const assignDefined = <T extends Record<string, unknown>>(
  target: T,
  key: keyof T,
  value: unknown,
): void => {
  if (value !== undefined) {
    target[key] = value as T[keyof T]
  }
}

@ApiTags('admin-skins')
@ApiBearerAuth()
@Controller('admin/skins')
@UseGuards(AdminJwtGuard, AdminRolesGuard)
export class AdminSkinsController {
  constructor(
    private readonly csgoSkins: CsgoSkinService,
    private readonly dotaSkins: DotaSkinService,
  ) {}

  private getRepo(gameType: AdminSkinGame): Repository<AdminSkinEntity> {
    return (
      gameType === 'dota' ? this.dotaSkins.getRepo() : this.csgoSkins.getRepo()
    ) as Repository<AdminSkinEntity>
  }

  private async findSkinOrThrow(
    gameType: AdminSkinGame,
    id: number,
  ): Promise<AdminSkinEntity> {
    const skin = await this.getRepo(gameType).findOne({
      where: { id } as never,
    })

    if (!skin) throw new NotFoundException('Skin not found')

    return skin
  }

  private async assertUniqueHashName(
    gameType: AdminSkinGame,
    marketHashName: string,
    ignoreId?: number,
  ): Promise<void> {
    const existing = await this.getRepo(gameType).findOne({
      where: { market_hash_name: marketHashName } as never,
    })

    if (existing && existing.id !== ignoreId) {
      throw new BadRequestException(
        'Skin with this market_hash_name already exists',
      )
    }
  }

  private buildCreateEntity(dto: CreateAdminSkinDto): AdminSkinEntity {
    const name = trimText(dto.name) ?? dto.market_hash_name
    const status = dto.status ?? SkinStatus.Available
    const marketPrice = dto.market_price ?? 0
    const slug = trimText(dto.slug) ?? slugify(dto.market_hash_name)
    const common = {
      amount_in_market: trimText(dto.amount_in_market) ?? '0',
      avg_price: dto.avg_price ?? null,
      background_color: trimText(dto.background_color),
      buy_order: dto.buy_order ?? null,
      category: trimText(dto.category),
      image: trimText(dto.image) ?? '',
      inspect_in_game: trimText(dto.inspect_in_game) ?? '',
      is_new: dto.is_new ?? false,
      item_type: trimText(dto.item_type),
      market_hash_name: dto.market_hash_name,
      market_price: marketPrice,
      name,
      name_color: trimText(dto.name_color),
      phase: trimText(dto.phase),
      popularity_7d: dto.popularity_7d ?? null,
      quality: trimText(dto.quality),
      rarity: trimText(dto.rarity),
      raw_market_price: dto.raw_market_price ?? null,
      ru_name: trimText(dto.ru_name),
      ru_quality: trimText(dto.ru_quality),
      slug,
      status,
    }

    if (dto.game_type === 'dota') {
      return this.dotaSkins.getRepo().create({
        ...common,
        category: common.category,
        collection: parseCollection(dto.collection),
        hero: trimText(dto.hero),
        item_type: common.item_type,
        slot: trimText(dto.slot),
      })
    }

    return this.csgoSkins.getRepo().create({
      ...common,
      background_color: common.background_color ?? '',
      category: common.category ?? '',
      collection: (trimText(dto.collection) ?? '') as unknown as string[],
      exterior: trimText(dto.exterior),
      float_part_value: '',
      float_value: 0,
      inspect_in_game: common.inspect_in_game,
      is_souvenir: false,
      is_stattrak: false,
      item_type: common.item_type ?? '',
      name_color: common.name_color ?? '',
      pattern: 0,
      quality: common.quality ?? '',
      rarity: common.rarity,
      skin_name: null,
      weapon: null,
    })
  }

  private buildUpdatePatch(
    gameType: AdminSkinGame,
    dto: UpdateAdminSkinDto,
  ): Partial<AdminSkinEntity> {
    const patch: Record<string, unknown> = {}

    assignDefined(
      patch,
      'market_hash_name',
      trimText(dto.market_hash_name) ?? undefined,
    )
    assignDefined(patch, 'name', trimText(dto.name) ?? undefined)
    assignDefined(patch, 'image', trimText(dto.image))
    assignDefined(patch, 'status', dto.status)
    assignDefined(patch, 'market_price', dto.market_price)
    assignDefined(patch, 'raw_market_price', dto.raw_market_price)
    assignDefined(patch, 'amount_in_market', trimText(dto.amount_in_market))
    assignDefined(patch, 'slug', trimText(dto.slug))
    assignDefined(patch, 'inspect_in_game', trimText(dto.inspect_in_game))
    assignDefined(patch, 'name_color', trimText(dto.name_color))
    assignDefined(patch, 'background_color', trimText(dto.background_color))
    assignDefined(patch, 'quality', trimText(dto.quality))
    assignDefined(patch, 'rarity', trimText(dto.rarity))
    assignDefined(patch, 'category', trimText(dto.category))
    assignDefined(patch, 'item_type', trimText(dto.item_type))
    assignDefined(patch, 'is_new', dto.is_new)
    assignDefined(patch, 'buy_order', dto.buy_order)
    assignDefined(patch, 'avg_price', dto.avg_price)
    assignDefined(patch, 'popularity_7d', dto.popularity_7d)
    assignDefined(patch, 'ru_name', trimText(dto.ru_name))
    assignDefined(patch, 'ru_quality', trimText(dto.ru_quality))
    assignDefined(patch, 'phase', trimText(dto.phase))

    if (dto.collection !== undefined) {
      patch.collection =
        gameType === 'dota'
          ? parseCollection(dto.collection)
          : ((trimText(dto.collection) ?? '') as unknown as string[])
    }

    if (gameType === 'dota') {
      assignDefined(patch, 'hero', trimText(dto.hero))
      assignDefined(patch, 'slot', trimText(dto.slot))
    } else {
      assignDefined(patch, 'exterior', trimText(dto.exterior))
    }

    return patch as Partial<AdminSkinEntity>
  }

  @Get()
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.MANAGER)
  async list(
    @Query('game_type') gameTypeRaw?: string,
    @Query('page') pageRaw?: string,
    @Query('limit') limitRaw?: string,
    @Query('status') statusRaw?: string,
    @Query('search') searchRaw?: string,
    @Query('sortDir') sortRaw?: string,
  ) {
    const gameType = parseGame(gameTypeRaw)
    const page = parsePositiveInt(pageRaw, DEFAULT_PAGE)
    const limit = parsePositiveInt(limitRaw, DEFAULT_LIMIT, MAX_LIMIT)
    const status = parseStatus(statusRaw)
    const search = parseText(searchRaw)
    const sortDir = parseSort(sortRaw)
    const repo =
      gameType === 'dota' ? this.dotaSkins.getRepo() : this.csgoSkins.getRepo()
    const qb = repo.createQueryBuilder(
      'skin',
    ) as SelectQueryBuilder<AdminSkinEntity>

    applyBaseSkinFilters(qb, status, search)
    qb.orderBy('skin.market_price', sortDir === 'asc' ? 'ASC' : 'DESC')
    qb.skip((page - 1) * limit).take(limit)

    const [items, total] = await qb.getManyAndCount()

    return {
      items,
      total,
      page,
      limit,
      hasMore: page * limit < total,
      filters: {
        game_type: gameType,
        search: search ?? null,
        sortDir,
        status,
      },
    }
  }

  @Post()
  @AdminMutation({ entity: 'skins', action: 'create' })
  async create(@Body() dto: CreateAdminSkinDto) {
    const gameType = parseGameStrict(dto.game_type)
    const marketHashName = dto.market_hash_name.trim()

    if (!marketHashName) {
      throw new BadRequestException('market_hash_name is required')
    }

    await this.assertUniqueHashName(gameType, marketHashName)

    const entity = this.buildCreateEntity({
      ...dto,
      game_type: gameType,
      market_hash_name: marketHashName,
    })

    return this.getRepo(gameType).save(entity)
  }

  @Patch(':gameType/:id')
  @AdminMutation({ entity: 'skins', action: 'update' })
  async update(
    @Param('gameType') gameTypeRaw: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAdminSkinDto,
  ) {
    const gameType = parseGameStrict(gameTypeRaw)
    const skin = await this.findSkinOrThrow(gameType, id)
    const marketHashName = dto.market_hash_name?.trim()

    if (marketHashName) {
      await this.assertUniqueHashName(gameType, marketHashName, id)
    }

    Object.assign(skin, this.buildUpdatePatch(gameType, dto))

    return this.getRepo(gameType).save(skin)
  }

  @Patch(':gameType/:id/status')
  @AdminMutation({ entity: 'skins', action: 'update' })
  async setStatus(
    @Param('gameType') gameTypeRaw: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAdminSkinStatusDto,
  ) {
    const gameType = parseGameStrict(gameTypeRaw)
    const skin = await this.findSkinOrThrow(gameType, id)
    skin.status = dto.status

    return this.getRepo(gameType).save(skin)
  }
}
