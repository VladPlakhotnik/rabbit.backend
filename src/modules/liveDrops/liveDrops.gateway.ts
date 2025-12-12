import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { LiveDropsService } from './liveDrops.service'
import { Logger } from '@nestjs/common'
import { GATEWAY_CONFIG } from './constants/events'

interface DropGenerationConfig {
  minInterval: number
  maxInterval: number
  initialDropsCount: number
}

@WebSocketGateway(GATEWAY_CONFIG)
export class LiveDropsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private server!: Server

  private readonly logger = new Logger(LiveDropsGateway.name)
  private readonly connectedClients = new Set<string>()
  private readonly config: DropGenerationConfig = {
    minInterval: 1000, // 1 second
    maxInterval: 10000, // 10 seconds
    initialDropsCount: 10,
  }

  private dropTimeout: NodeJS.Timeout | null = null
  private isGenerating: boolean = false

  constructor(private readonly liveDropsService: LiveDropsService) {}

  handleConnection(client: Socket): void {
    this.connectedClients.add(client.id)
    this.logger.log(
      `Client connected: ${client.id}. Total clients: ${this.connectedClients.size}`,
    )

    if (this.connectedClients.size === 1) {
      this.startDropGeneration()
    }
  }

  handleDisconnect(client: Socket): void {
    this.connectedClients.delete(client.id)
    this.logger.log(
      `Client disconnected: ${client.id}. Total clients: ${this.connectedClients.size}`,
    )

    if (this.connectedClients.size === 0) {
      this.stopDropGeneration()
    }
  }

  onModuleDestroy(): void {
    this.stopDropGeneration()
  }

  private getRandomInterval(): number {
    const { minInterval, maxInterval } = this.config
    return Math.floor(Math.random() * (maxInterval - minInterval) + minInterval)
  }

  private async generateDrop(): Promise<void> {
    if (this.isGenerating) {
      return
    }

    try {
      this.isGenerating = true
      const drop = await this.liveDropsService.generateRandomDrop()

      if (drop) {
        this.logger.log(`Generated drop skin id: ${drop.skin.id}`)
        this.server.emit('liveDrop', drop)
      }
    } catch (error: any) {
      this.logger.error(`Error generating drop: ${error.message}`)
    } finally {
      this.isGenerating = false
    }
  }

  private async generateInitialDrops(): Promise<void> {
    try {
      this.isGenerating = true
      const drops = []

      for (let i = 0; i < this.config.initialDropsCount; i++) {
        const drop = await this.liveDropsService.generateRandomDrop()
        if (drop) drops.push(drop)
      }

      if (drops.length > 0) {
        this.server.emit('initialDrops', drops)
      }
    } catch (error: any) {
      this.logger.error(`Error generating initial drops: ${error.message}`)
    } finally {
      this.isGenerating = false
    }
  }

  private async startDropGeneration(): Promise<void> {
    this.stopDropGeneration()

    await this.generateInitialDrops()

    const generateNextDrop = async () => {
      if (this.connectedClients.size === 0) return

      await this.generateDrop()
      const interval = this.getRandomInterval()
      this.dropTimeout = setTimeout(generateNextDrop, interval)
    }

    generateNextDrop()
  }

  private stopDropGeneration(): void {
    if (this.dropTimeout) {
      clearTimeout(this.dropTimeout)
      this.dropTimeout = null
    }
    this.isGenerating = false
  }
}
