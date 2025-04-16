import { Controller, Get, Query } from '@nestjs/common'
import { LiveDropService } from './liveDrop.service'
import { LiveDrop } from './liveDrop.entity'

@Controller('live-drops')
export class LiveDropController {
  constructor(private readonly liveDropService: LiveDropService) {}

  @Get()
  async getRecentDrops(@Query('limit') limit?: number): Promise<LiveDrop[]> {
    return this.liveDropService.getRecentDrops(limit)
  }
}
