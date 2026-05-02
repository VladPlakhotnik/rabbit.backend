import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { Logger, OnModuleDestroy } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { NotificationService } from './notification.service'
import type { JwtPayload } from '../auth/auth.service'
import { getCorsOrigins } from '../../core/config/cors'

// Push notifications channel.
//
// Each browser tab opens one socket on the `/notifications` namespace and
// passes its access token via `socket.handshake.auth.token`. We verify the
// JWT once on connect, extract `sub` (= user_id) and index the socket in
// `userSockets: Map<userId, Set<Socket>>`. When NotificationService.create
// fires (via the pub/sub bridge `onNotification`), we look up the user's
// sockets and emit `notification:new` to each.
//
// Personal notifications (user_id != null) only go to that user's
// sockets; global ones (user_id = null, admin-broadcast) are server.emit
// to everyone connected.
//
// We deliberately do not bridge through Redis here — there's a single
// backend replica today (Fly `min_machines_running = 1`). If the project
// ever scales horizontally, swap onNotification → Redis pub/sub the same
// way LiveDropsGateway does it.

const NAMESPACE = '/notifications'

export const NOTIFICATION_EVENTS = {
  NEW: 'notification:new',
} as const

const GATEWAY_CONFIG = {
  cors: {
    origin: getCorsOrigins(),
    credentials: true,
  },
  namespace: NAMESPACE,
  transports: ['websocket', 'polling'],
  pingInterval: 10_000,
  pingTimeout: 5_000,
} as const

@WebSocketGateway(GATEWAY_CONFIG)
export class NotificationsGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleDestroy
{
  @WebSocketServer()
  private server!: Server

  private readonly logger = new Logger(NotificationsGateway.name)

  // userId → set of live sockets. Set (not single Socket) because one
  // user can have multiple tabs open; all should get the push.
  private readonly userSockets = new Map<number, Set<Socket>>()

  // Reverse index for O(1) cleanup on disconnect — without this we'd
  // have to scan every user's set on every disconnect.
  private readonly socketUser = new WeakMap<Socket, number>()

  private unsubscribe?: () => void

  constructor(
    private readonly notificationService: NotificationService,
    private readonly jwtService: JwtService,
  ) {}

  afterInit(): void {
    this.unsubscribe = this.notificationService.onNotification(event => {
      const { userId, notification } = event

      if (userId == null) {
        // Global notification — fan out to everyone.
        this.server.emit(NOTIFICATION_EVENTS.NEW, notification)
        return
      }

      const sockets = this.userSockets.get(userId)
      if (!sockets || sockets.size === 0) {
        // User isn't connected right now — they'll see it on next
        // dropdown open via the regular HTTP fetch.
        return
      }
      for (const socket of sockets) {
        socket.emit(NOTIFICATION_EVENTS.NEW, notification)
      }
    })
    this.logger.log('Notifications gateway initialized')
  }

  onModuleDestroy(): void {
    this.unsubscribe?.()
  }

  handleConnection(client: Socket): void {
    const token = this.extractToken(client)
    if (!token) {
      this.logger.debug(`Rejecting connection ${client.id}: no token`)
      client.disconnect(true)
      return
    }

    let payload: JwtPayload
    try {
      payload = this.jwtService.verify<JwtPayload>(token)
    } catch (err) {
      this.logger.debug(
        `Rejecting connection ${client.id}: invalid token (${
          err instanceof Error ? err.message : String(err)
        })`,
      )
      client.disconnect(true)
      return
    }

    const userId = payload.sub
    if (typeof userId !== 'number') {
      this.logger.debug(
        `Rejecting connection ${client.id}: token has no sub`,
      )
      client.disconnect(true)
      return
    }

    let bucket = this.userSockets.get(userId)
    if (!bucket) {
      bucket = new Set()
      this.userSockets.set(userId, bucket)
    }
    bucket.add(client)
    this.socketUser.set(client, userId)
  }

  handleDisconnect(client: Socket): void {
    const userId = this.socketUser.get(client)
    if (userId == null) return

    const bucket = this.userSockets.get(userId)
    if (bucket) {
      bucket.delete(client)
      if (bucket.size === 0) this.userSockets.delete(userId)
    }
    this.socketUser.delete(client)
  }

  // socket.io clients pass the token via `auth: { token }`. Fall back to
  // a `?token=` query param so a curl-style debug client also works.
  private extractToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.token
    if (typeof authToken === 'string' && authToken.length > 0) {
      return authToken
    }
    const queryToken = client.handshake.query?.token
    if (typeof queryToken === 'string' && queryToken.length > 0) {
      return queryToken
    }
    return null
  }
}
