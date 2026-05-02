import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { Logger } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ClickerUserService } from './clicker-user.service'
import { ClickBatchDto } from './dto/click.dto'
import { EVENTS, GATEWAY_CONFIG } from './constants/events'
import {
  ClickAckPayload,
  ErrorResponse,
  UpgradeAckPayload,
} from './types/user-update.types'
import type { JwtPayload } from '../auth/auth.service'

// Maximum drift we accept on the client-supplied timestamp before we treat it
// as a forgery / clock-skew artifact. Energy regen is server-anchored so this
// just prevents someone from sending `ts: yearAgo` to fake regenerated energy.
const MAX_TS_DRIFT_MS = 5 * 60 * 1000

@WebSocketGateway(GATEWAY_CONFIG)
export class ClickerUserGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private readonly server!: Server

  private readonly logger = new Logger(ClickerUserGateway.name)
  private readonly socketUserId = new WeakMap<Socket, number>()

  constructor(
    private readonly clickerUserService: ClickerUserService,
    private readonly jwtService: JwtService,
  ) {}

  afterInit(): void {
    this.logger.log('Clicker gateway initialized')
  }

  handleConnection(client: Socket): void {
    const token = this.extractToken(client)
    if (!token) {
      this.logger.debug(`reject ${client.id}: no token`)
      client.disconnect(true)
      return
    }

    let payload: JwtPayload
    try {
      payload = this.jwtService.verify<JwtPayload>(token)
    } catch (err) {
      this.logger.debug(
        `reject ${client.id}: invalid token (${
          err instanceof Error ? err.message : String(err)
        })`,
      )
      client.disconnect(true)
      return
    }

    const userId =
      typeof payload.sub === 'string' ? Number(payload.sub) : payload.sub
    if (typeof userId !== 'number' || !Number.isFinite(userId) || userId <= 0) {
      this.logger.debug(`reject ${client.id}: bad sub`)
      client.disconnect(true)
      return
    }

    this.socketUserId.set(client, userId)
  }

  handleDisconnect(client: Socket): void {
    this.socketUserId.delete(client)
  }

  @SubscribeMessage(EVENTS.CLICK)
  async handleClick(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: ClickBatchDto,
  ): Promise<ClickAckPayload | { error: string }> {
    const userId = this.socketUserId.get(client)
    if (userId == null) {
      return this.errorAck(client, 'Not authenticated')
    }

    try {
      const count = this.coerceCount(body)
      if (count <= 0) {
        return this.errorAck(client, 'count must be a positive number')
      }
      const nowMs = this.coerceTs(body)

      const result = await this.clickerUserService.handleClickBatch(
        userId,
        count,
        nowMs,
      )

      const payload: ClickAckPayload = {
        userId,
        accepted: result.accepted,
        points: result.points,
        energy: result.energy,
        maxEnergy: result.max_energy,
        cost: result.cost,
        regenPerSec: result.regen_per_sec,
        level: result.level_id,
        clickLevel: result.click_level_id,
        energyLevel: result.energy_level_id,
      }
      // Ack only — no broadcast. Other tabs of the same user see updates via
      // their own batched click cycle / explicit getState calls.
      return payload
    } catch (err) {
      return this.errorAck(client, err)
    }
  }

  @SubscribeMessage(EVENTS.UPGRADE_CLICK)
  async handleUpgradeClick(
    @ConnectedSocket() client: Socket,
  ): Promise<UpgradeAckPayload | { error: string }> {
    const userId = this.socketUserId.get(client)
    if (userId == null) {
      return this.errorAck(client, 'Not authenticated')
    }

    try {
      await this.clickerUserService.upgradeClickLevel(userId)
      // After upgrade Redis state is wiped — re-load fresh state so client
      // sees the new click_level cost reflected in subsequent clicks.
      const fresh = await this.clickerUserService.getCurrentState(userId)
      const payload: UpgradeAckPayload = {
        userId,
        points: fresh.points,
        energy: fresh.energy,
        maxEnergy: fresh.max_energy,
        cost: fresh.cost,
        regenPerSec: fresh.regen_per_sec,
        level: fresh.level_id,
        clickLevel: fresh.click_level_id,
        energyLevel: fresh.energy_level_id,
      }
      this.emitToUserSocket(client, EVENTS.USER_UPDATE, payload)
      return payload
    } catch (err) {
      return this.errorAck(client, err)
    }
  }

  @SubscribeMessage(EVENTS.UPGRADE_ENERGY)
  async handleUpgradeEnergy(
    @ConnectedSocket() client: Socket,
  ): Promise<UpgradeAckPayload | { error: string }> {
    const userId = this.socketUserId.get(client)
    if (userId == null) {
      return this.errorAck(client, 'Not authenticated')
    }

    try {
      await this.clickerUserService.upgradeEnergyLevel(userId)
      const fresh = await this.clickerUserService.getCurrentState(userId)
      const payload: UpgradeAckPayload = {
        userId,
        points: fresh.points,
        energy: fresh.energy,
        maxEnergy: fresh.max_energy,
        cost: fresh.cost,
        regenPerSec: fresh.regen_per_sec,
        level: fresh.level_id,
        clickLevel: fresh.click_level_id,
        energyLevel: fresh.energy_level_id,
      }
      this.emitToUserSocket(client, EVENTS.USER_UPDATE, payload)
      return payload
    } catch (err) {
      return this.errorAck(client, err)
    }
  }

  @SubscribeMessage(EVENTS.GET_STATE)
  async handleGetState(
    @ConnectedSocket() client: Socket,
  ): Promise<UpgradeAckPayload | { error: string }> {
    const userId = this.socketUserId.get(client)
    if (userId == null) {
      return this.errorAck(client, 'Not authenticated')
    }

    try {
      const state = await this.clickerUserService.getCurrentState(userId)
      const payload: UpgradeAckPayload = {
        userId,
        points: state.points,
        energy: state.energy,
        maxEnergy: state.max_energy,
        cost: state.cost,
        regenPerSec: state.regen_per_sec,
        level: state.level_id,
        clickLevel: state.click_level_id,
        energyLevel: state.energy_level_id,
      }
      client.emit(EVENTS.STATE, payload)
      return payload
    } catch (err) {
      return this.errorAck(client, err)
    }
  }

  private coerceCount(body: unknown): number {
    if (body == null || typeof body !== 'object') return 0
    const raw = (body as { count?: unknown }).count
    const n = typeof raw === 'string' ? Number(raw) : raw
    if (typeof n !== 'number' || !Number.isFinite(n)) return 0
    return Math.max(0, Math.floor(n))
  }

  private coerceTs(body: unknown): number {
    const now = Date.now()
    if (body == null || typeof body !== 'object') return now
    const raw = (body as { ts?: unknown }).ts
    const n = typeof raw === 'string' ? Number(raw) : raw
    if (typeof n !== 'number' || !Number.isFinite(n)) return now
    // Reject anything implausibly far from server clock — energy regen is
    // anchored to this timestamp inside Lua.
    if (Math.abs(now - n) > MAX_TS_DRIFT_MS) return now
    return n
  }

  private emitToUserSocket(
    client: Socket,
    event: string,
    payload: unknown,
  ): void {
    client.emit(event, payload)
  }

  private errorAck(
    client: Socket,
    err: unknown,
  ): { error: string } {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === 'string'
          ? err
          : 'unknown'
    const errorResponse: ErrorResponse = { message }
    client.emit(EVENTS.ERROR, errorResponse)
    return { error: message }
  }

  // socket.io clients pass the access token via `auth: { token }`. Fall back
  // to a `?token=` query param so a debug client can connect too.
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
