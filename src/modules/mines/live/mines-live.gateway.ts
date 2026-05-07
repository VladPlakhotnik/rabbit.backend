import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'
import { Logger } from '@nestjs/common'
import { Server, Socket } from 'socket.io'
import {
  MINES_LIVE_EVENTS,
  MINES_LIVE_GATEWAY_CONFIG,
} from './mines-live.constants'
import { MinesLiveService } from './mines-live.service'

@WebSocketGateway(MINES_LIVE_GATEWAY_CONFIG)
export class MinesLiveGateway implements OnGatewayConnection, OnGatewayInit {
  @WebSocketServer()
  private server!: Server

  private readonly logger = new Logger(MinesLiveGateway.name)

  constructor(private readonly minesLiveService: MinesLiveService) {}

  async afterInit(): Promise<void> {
    await this.minesLiveService.onDrop(drop => {
      this.server.emit(MINES_LIVE_EVENTS.LIVE_DROP, drop)
    })

    this.logger.log('Mines live gateway initialized')
  }

  async handleConnection(client: Socket): Promise<void> {
    this.logger.log(`Client connected: ${client.id}`)
    const recent = await this.minesLiveService.getRecent()

    if (recent.length > 0) {
      client.emit(MINES_LIVE_EVENTS.INITIAL_DROPS, recent)
    }
  }
}
