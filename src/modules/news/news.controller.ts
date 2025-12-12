import { Controller, Get, Param, NotFoundException } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { NewsService } from './news.service'
import { News } from './entities/news.entity'

@ApiTags('news')
@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @ApiOperation({ summary: 'Get all news' })
  @ApiResponse({
    status: 200,
    description: 'Return all news ordered by creation date (newest first)',
    type: [News],
  })
  @Get()
  async getAllNews(): Promise<News[]> {
    return this.newsService.findAll()
  }

  @ApiOperation({ summary: 'Get news by slug' })
  @ApiResponse({
    status: 200,
    description: 'Return news by slug',
    type: News,
  })
  @ApiResponse({
    status: 404,
    description: 'News not found',
  })
  @Get(':slug')
  async getNewsBySlug(@Param('slug') slug: string): Promise<News> {
    try {
      return await this.newsService.findBySlug(slug)
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw error
      }
      throw new NotFoundException(`News with slug "${slug}" not found`)
    }
  }
}
