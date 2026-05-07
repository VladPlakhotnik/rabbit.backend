import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'
import { Logger } from '@nestjs/common'
import { Server, Socket } from 'socket.io'
import {
  CRASH_LIVE_EVENTS,
  CRASH_LIVE_GATEWAY_CONFIG,
} from './crash-live.constants'
import { CrashLiveService } from './crash-live.service'

@WebSocketGateway(CRASH_LIVE_GATEWAY_CONFIG)
export class CrashLiveGateway implements OnGatewayConnection, OnGatewayInit {
  @WebSocketServer()
  private server!: Server

  private readonly logger = new Logger(CrashLiveGateway.name)
  private unsubscribe: (() => void) | null = null

  constructor(private readonly crashLiveService: CrashLiveService) {}

  afterInit(): void {
    this.unsubscribe = this.crashLiveService.onState(snapshot => {
      this.server.emit(CRASH_LIVE_EVENTS.STATE, snapshot)
    })
    this.logger.log('Crash live gateway initialized')
  }

  handleConnection(client: Socket): void {
    client.emit(
      CRASH_LIVE_EVENTS.INITIAL_STATE,
      this.crashLiveService.getSnapshot(),
    )
  }

  afterDestroy(): void {
    this.unsubscribe?.()
  }
}
