import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayInit,
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { Logger } from '@nestjs/common'
import { LiveDropsService } from './liveDrops.service'
import { EVENTS, GATEWAY_CONFIG } from './constants/events'

@WebSocketGateway(GATEWAY_CONFIG)
export class LiveDropsGateway implements OnGatewayConnection, OnGatewayInit {
  @WebSocketServer()
  private server!: Server

  private readonly logger = new Logger(LiveDropsGateway.name)

  constructor(private readonly liveDropsService: LiveDropsService) {}

  async afterInit(): Promise<void> {
    // Bridge Redis Pub/Sub → Socket.IO room. Every drop pushed by any backend
    // instance (this one or another dyno) gets fanned out to all clients
    // connected to *this* server. With multiple dynos, sticky sessions on
    // Heroku ensure a given client stays on one dyno; cross-dyno fan-out is
    // handled by Redis itself.
    await this.liveDropsService.onDrop(drop => {
      this.server.emit(EVENTS.LIVE_DROP, drop)
    })
    this.logger.log('LiveDrops gateway initialized')
  }

  async handleConnection(client: Socket): Promise<void> {
    this.logger.log(`Client connected: ${client.id}`)
    const recent = await this.liveDropsService.getRecent()
    if (recent.length > 0) {
      client.emit(EVENTS.INITIAL_DROPS, recent)
    }
  }
}
