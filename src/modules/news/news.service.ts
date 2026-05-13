import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, SelectQueryBuilder } from 'typeorm'
import { News, type NewsContentBlock } from './entities/news.entity'
import type {
  AdminNewsListQueryDto,
  CreateNewsDto,
  UpdateNewsDto,
} from './dto/admin-news.dto'

type AdminNewsListResult = {
  filters: {
    category: string | null
    search: string | null
  }
  hasMore: boolean
  items: News[]
  limit: number
  page: number
  total: number
}

const CONTENT_TYPES = new Set<NewsContentBlock['type']>([
  'title',
  'text',
  'image',
  'video',
  'link',
  'list',
])

const trimRequired = (value: string | undefined, field: string): string => {
  const nextValue = value?.trim()
  if (!nextValue) {
    throw new BadRequestException(`${field} is required`)
  }
  return nextValue
}

const trimOptional = (value: string | undefined): string | undefined => {
  const nextValue = value?.trim()
  return nextValue || undefined
}

@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name)

  constructor(
    @InjectRepository(News)
    private readonly newsRepository: Repository<News>,
  ) {}

  /**
   * Get all news ordered by creation date (newest first)
   */
  async findAll(): Promise<News[]> {
    const news = await this.newsRepository.find({
      order: {
        created_at: 'DESC',
      },
    })

    return news
  }

  async findAllForAdmin(
    filters: AdminNewsListQueryDto = {},
  ): Promise<AdminNewsListResult> {
    const page = filters.page ?? 1
    const limit = Math.min(filters.limit ?? 20, 100)
    const search = filters.search?.trim() || null
    const category = filters.category?.trim() || null

    const qb = this.newsRepository.createQueryBuilder('news')
    const addWhere = this.createWhereAppender(qb)

    if (category) {
      addWhere('news.category = :category', { category })
    }

    if (search) {
      addWhere(
        `(CAST(news.id AS TEXT) ILIKE :search OR news.slug ILIKE :search OR news.title ILIKE :search OR news.category ILIKE :search OR CAST(news.content AS TEXT) ILIKE :search)`,
        { search: `%${search}%` },
      )
    }

    const [items, total] = await qb
      .orderBy('news.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount()

    return {
      filters: { category, search },
      hasMore: page * limit < total,
      items,
      limit,
      page,
      total,
    }
  }

  async findAdminById(id: number): Promise<News> {
    const news = await this.newsRepository.findOne({ where: { id } })
    if (!news) {
      throw new NotFoundException('News not found')
    }
    return news
  }

  async createAdmin(dto: CreateNewsDto): Promise<News> {
    const slug = this.normalizeSlug(dto.slug)
    const category = trimRequired(dto.category, 'category')
    const content = this.normalizeContent(dto.content)
    const previewImage = trimRequired(dto.preview_image, 'preview_image')
    const title = trimRequired(dto.title, 'title')

    await this.ensureSlugAvailable(slug)

    const news = this.newsRepository.create({
      category,
      content,
      preview_image: previewImage,
      slug,
      title,
    })

    return this.newsRepository.save(news)
  }

  async updateAdmin(id: number, dto: UpdateNewsDto): Promise<News> {
    const news = await this.findAdminById(id)

    if (dto.slug !== undefined) {
      const slug = this.normalizeSlug(dto.slug)
      await this.ensureSlugAvailable(slug, id)
      news.slug = slug
    }
    if (dto.title !== undefined) {
      news.title = trimRequired(dto.title, 'title')
    }
    if (dto.category !== undefined) {
      news.category = trimRequired(dto.category, 'category')
    }
    if (dto.preview_image !== undefined) {
      news.preview_image = trimRequired(dto.preview_image, 'preview_image')
    }
    if (dto.content !== undefined) {
      news.content = this.normalizeContent(dto.content)
    }

    return this.newsRepository.save(news)
  }

  async removeAdmin(id: number): Promise<void> {
    const news = await this.findAdminById(id)
    await this.newsRepository.remove(news)
  }

  /**
   * Get news by slug
   */
  async findBySlug(slug: string): Promise<News> {
    const news = await this.newsRepository.findOne({
      where: { slug },
    })

    if (!news) {
      throw new NotFoundException(`News with slug "${slug}" not found`)
    }

    return news
  }

  private createWhereAppender(qb: SelectQueryBuilder<News>) {
    let hasWhere = false
    return (condition: string, parameters?: Record<string, unknown>) => {
      if (hasWhere) {
        qb.andWhere(condition, parameters)
      } else {
        qb.where(condition, parameters)
        hasWhere = true
      }
    }
  }

  private normalizeSlug(value: string | undefined): string {
    const slug = trimRequired(value, 'slug').toLowerCase()
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new BadRequestException(
        'slug must contain lowercase letters, numbers, and hyphens',
      )
    }
    return slug
  }

  private normalizeContent(content: NewsContentBlock[]): NewsContentBlock[] {
    if (!Array.isArray(content) || content.length === 0) {
      throw new BadRequestException('content must contain at least one block')
    }

    return content.map((block, index) => {
      if (!CONTENT_TYPES.has(block.type)) {
        throw new BadRequestException(`content.${index}.type is invalid`)
      }

      const contentValue = trimOptional(block.content)
      const url = trimOptional(block.url)
      const alt = trimOptional(block.alt)

      if (['title', 'text', 'list'].includes(block.type) && !contentValue) {
        throw new BadRequestException(
          `content.${index}.content is required for ${block.type}`,
        )
      }
      if (['image', 'video'].includes(block.type) && !url) {
        throw new BadRequestException(
          `content.${index}.url is required for ${block.type}`,
        )
      }
      if (block.type === 'link' && (!url || !contentValue)) {
        throw new BadRequestException(
          `content.${index}.url and content are required for link`,
        )
      }

      return {
        ...(alt ? { alt } : {}),
        ...(contentValue ? { content: contentValue } : {}),
        type: block.type,
        ...(url ? { url } : {}),
      }
    })
  }

  private async ensureSlugAvailable(
    slug: string,
    currentId?: number,
  ): Promise<void> {
    const existing = await this.newsRepository.findOne({ where: { slug } })
    if (existing && existing.id !== currentId) {
      throw new ConflictException('News slug already exists')
    }
  }
}
