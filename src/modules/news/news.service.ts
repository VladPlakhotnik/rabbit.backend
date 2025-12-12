import { Injectable, NotFoundException, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { News } from './entities/news.entity'

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
}
