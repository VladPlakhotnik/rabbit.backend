import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { LiveDrop } from './liveDrop.entity'
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets'
import { Server } from 'socket.io'
import { Cron, CronExpression } from '@nestjs/schedule'

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class LiveDropService {
  @WebSocketServer()
  server!: Server

  constructor(
    @InjectRepository(LiveDrop)
    private readonly liveDropRepository: Repository<LiveDrop>,
  ) {}

  async createBotDrop(
    caseId: string,
    skinId: string,
    skinPrice: number,
  ): Promise<LiveDrop> {
    const liveDrop = this.liveDropRepository.create({
      caseId,
      skinId,
      skinPrice,
      isBot: true,
      isDisplayed: false,
    })

    await this.liveDropRepository.save(liveDrop)
    return liveDrop
  }

  async createUserDrop(
    userId: string,
    caseId: string,
    skinId: string,
    skinPrice: number,
  ): Promise<LiveDrop> {
    const liveDrop = this.liveDropRepository.create({
      userId,
      caseId,
      skinId,
      skinPrice,
      isBot: false,
      isDisplayed: false,
    })

    await this.liveDropRepository.save(liveDrop)
    this.emitNewDrop(liveDrop)
    return liveDrop
  }

  private emitNewDrop(liveDrop: LiveDrop) {
    this.server.emit('newDrop', liveDrop)
  }

  @Cron(CronExpression.EVERY_5_SECONDS)
  async processNextBotDrop() {
    const nextDrop = await this.liveDropRepository.findOne({
      where: { isBot: true, isDisplayed: false },
      order: { createdAt: 'ASC' },
    })

    if (nextDrop) {
      nextDrop.isDisplayed = true
      await this.liveDropRepository.save(nextDrop)
      this.emitNewDrop(nextDrop)
    }
  }

  async getRecentDrops(limit: number = 50): Promise<LiveDrop[]> {
    return this.liveDropRepository.find({
      where: { isDisplayed: true },
      order: { createdAt: 'DESC' },
      take: limit,
      relations: ['user', 'case', 'skin'],
    })
  }
}
