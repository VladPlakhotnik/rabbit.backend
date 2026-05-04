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
  AutoClickerClaimAck,
  ClickAckPayload,
  ErrorResponse,
  SkillUpgradeAckPayload,
  UpgradeAckPayload,
} from './types/user-update.types'
import type { JwtPayload } from '../auth/auth.service'
import {
  MAX_TS_DRIFT_MS,
  UPGRADE_THROTTLE_MS,
} from './constants/clicker.constants'
import { clickerLog } from './clicker-debug'

@WebSocketGateway(GATEWAY_CONFIG)
export class ClickerUserGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private readonly server!: Server

  private readonly logger = new Logger(ClickerUserGateway.name)
  private readonly socketUserId = new WeakMap<Socket, number>()
  // ms-since-epoch of the last upgrade-event each socket fired. Used for
  // a per-socket cooldown only — the upgrade method itself is row-locked,
  // so this map is purely a perf shortcut.
  private readonly lastUpgradeAt = new WeakMap<Socket, number>()

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
      clickerLog('ws.connect', { socket: client.id, op: 'reject-no-token' })
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
      clickerLog('ws.connect', {
        socket: client.id,
        op: 'reject-bad-token',
        err: err instanceof Error ? err.message : String(err),
      })
      client.disconnect(true)
      return
    }

    const userId =
      typeof payload.sub === 'string' ? Number(payload.sub) : payload.sub
    if (typeof userId !== 'number' || !Number.isFinite(userId) || userId <= 0) {
      this.logger.debug(`reject ${client.id}: bad sub`)
      clickerLog('ws.connect', {
        socket: client.id,
        op: 'reject-bad-sub',
        sub: payload.sub,
      })
      client.disconnect(true)
      return
    }

    this.socketUserId.set(client, userId)
    clickerLog('ws.connect', {
      socket: client.id,
      user: userId,
      op: 'accepted',
    })

    // Push fresh state on every connection (including reconnects after a
    // backend restart). The click Lua's bank simulation only advances
    // when something actually CALLS Lua — without this, a player who
    // opens the app, closes it, reopens it without refreshing the
    // browser would never trigger a sim, and their accumulated bank
    // would stay frozen at the last interaction. Best-effort —
    // failures are logged but don't reject the connection.
    void this.pushInitialState(client, userId)
  }

  private async pushInitialState(client: Socket, userId: number): Promise<void> {
    try {
      const state = await this.clickerUserService.getCurrentState(userId)
      const payload: UpgradeAckPayload = {
        userId,
        points: state.points,
        totalPoints: state.total_points,
        energy: state.energy,
        maxEnergy: state.max_energy,
        cost: state.cost,
        regenPerSec: state.regen_per_sec,
        level: state.level_id,
        clickLevel: state.click_level_id,
        energyLevel: state.energy_level_id,
        autoCredited: state.auto_credited,
        autoClickerStartedAtMs: state.auto_clicker_started_at_ms,
        autoClickerMaxIdleSec: state.auto_clicker_max_idle_sec,
        autoClickerPendingCount: state.auto_clicker_pending_count,
        autoClickerPendingValue: state.auto_clicker_pending_value,
      }
      clickerLog('ws.out', {
        socket: client.id,
        user: userId,
        event: EVENTS.STATE,
        op: 'initial-state',
        points: payload.points,
        energy: payload.energy,
        max_energy: payload.maxEnergy,
        regen_per_sec: payload.regenPerSec,
        apc: payload.autoClickerPendingCount,
        apv: payload.autoClickerPendingValue,
        ac_started_at_ms: payload.autoClickerStartedAtMs,
        ac_max_idle_sec: payload.autoClickerMaxIdleSec,
      })
      client.emit(EVENTS.STATE, payload)
    } catch (err) {
      this.logger.warn(
        `pushInitialState failed for user ${userId}: ${
          err instanceof Error ? err.message : err
        }`,
      )
      clickerLog('ws.out', {
        socket: client.id,
        user: userId,
        op: 'initial-state-failed',
        err: err instanceof Error ? err.message : String(err),
      })
    }
  }

  handleDisconnect(client: Socket): void {
    const userId = this.socketUserId.get(client)
    clickerLog('ws.disconnect', { socket: client.id, user: userId ?? null })
    this.socketUserId.delete(client)
  }

  @SubscribeMessage(EVENTS.CLICK)
  async handleClick(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: ClickBatchDto,
  ): Promise<ClickAckPayload | { error: string }> {
    const userId = this.socketUserId.get(client)
    if (userId == null) {
      clickerLog('ws.in', {
        socket: client.id,
        event: EVENTS.CLICK,
        op: 'no-auth',
      })
      return this.errorAck(client, 'Not authenticated')
    }

    try {
      const count = this.coerceCount(body)
      if (count <= 0) {
        clickerLog('ws.in', {
          socket: client.id,
          user: userId,
          event: EVENTS.CLICK,
          op: 'invalid-count',
          raw: JSON.stringify(body),
        })
        return this.errorAck(client, 'count must be a positive number')
      }
      const nowMs = this.coerceTs(body)
      clickerLog('ws.in', {
        socket: client.id,
        user: userId,
        event: EVENTS.CLICK,
        count,
        ts: nowMs,
      })

      const result = await this.clickerUserService.handleClickBatch(
        userId,
        count,
        nowMs,
      )

      const payload: ClickAckPayload = {
        userId,
        accepted: result.accepted,
        points: result.points,
        totalPoints: result.total_points,
        energy: result.energy,
        maxEnergy: result.max_energy,
        cost: result.cost,
        regenPerSec: result.regen_per_sec,
        level: result.level_id,
        clickLevel: result.click_level_id,
        energyLevel: result.energy_level_id,
        critCount: result.crit_count,
        autoCredited: result.auto_credited,
        autoClickerStartedAtMs: result.auto_clicker_started_at_ms,
        autoClickerMaxIdleSec: result.auto_clicker_max_idle_sec,
        autoClickerPendingCount: result.auto_clicker_pending_count,
        autoClickerPendingValue: result.auto_clicker_pending_value,
      }
      clickerLog('ws.out', {
        socket: client.id,
        user: userId,
        event: 'click-ack',
        accepted: payload.accepted,
        points: payload.points,
        energy: payload.energy,
        regen_per_sec: payload.regenPerSec,
        crit_count: payload.critCount,
        auto_credited: payload.autoCredited,
        apc: payload.autoClickerPendingCount,
        apv: payload.autoClickerPendingValue,
      })
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
      clickerLog('ws.in', {
        socket: client.id,
        event: EVENTS.UPGRADE_CLICK,
        op: 'no-auth',
      })
      return this.errorAck(client, 'Not authenticated')
    }
    clickerLog('ws.in', {
      socket: client.id,
      user: userId,
      event: EVENTS.UPGRADE_CLICK,
    })

    try {
      await this.clickerUserService.upgradeClickLevel(userId)
      // After upgrade Redis state is wiped — re-load fresh state so client
      // sees the new click_level cost reflected in subsequent clicks.
      const fresh = await this.clickerUserService.getCurrentState(userId)
      const payload: UpgradeAckPayload = {
        userId,
        points: fresh.points,
        totalPoints: fresh.total_points,
        energy: fresh.energy,
        maxEnergy: fresh.max_energy,
        cost: fresh.cost,
        regenPerSec: fresh.regen_per_sec,
        level: fresh.level_id,
        clickLevel: fresh.click_level_id,
        energyLevel: fresh.energy_level_id,
        autoCredited: fresh.auto_credited,
        autoClickerStartedAtMs: fresh.auto_clicker_started_at_ms,
        autoClickerMaxIdleSec: fresh.auto_clicker_max_idle_sec,
        autoClickerPendingCount: fresh.auto_clicker_pending_count,
        autoClickerPendingValue: fresh.auto_clicker_pending_value,
      }
      clickerLog('ws.out', {
        socket: client.id,
        user: userId,
        event: EVENTS.USER_UPDATE,
        op: 'after-upgrade-click',
        click_level_id: payload.clickLevel,
        cost: payload.cost,
        points: payload.points,
      })
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
      clickerLog('ws.in', {
        socket: client.id,
        event: EVENTS.UPGRADE_ENERGY,
        op: 'no-auth',
      })
      return this.errorAck(client, 'Not authenticated')
    }
    clickerLog('ws.in', {
      socket: client.id,
      user: userId,
      event: EVENTS.UPGRADE_ENERGY,
    })

    try {
      await this.clickerUserService.upgradeEnergyLevel(userId)
      const fresh = await this.clickerUserService.getCurrentState(userId)
      const payload: UpgradeAckPayload = {
        userId,
        points: fresh.points,
        totalPoints: fresh.total_points,
        energy: fresh.energy,
        maxEnergy: fresh.max_energy,
        cost: fresh.cost,
        regenPerSec: fresh.regen_per_sec,
        level: fresh.level_id,
        clickLevel: fresh.click_level_id,
        energyLevel: fresh.energy_level_id,
        autoCredited: fresh.auto_credited,
        autoClickerStartedAtMs: fresh.auto_clicker_started_at_ms,
        autoClickerMaxIdleSec: fresh.auto_clicker_max_idle_sec,
        autoClickerPendingCount: fresh.auto_clicker_pending_count,
        autoClickerPendingValue: fresh.auto_clicker_pending_value,
      }
      clickerLog('ws.out', {
        socket: client.id,
        user: userId,
        event: EVENTS.USER_UPDATE,
        op: 'after-upgrade-energy',
        energy_level_id: payload.energyLevel,
        max_energy: payload.maxEnergy,
        regen_per_sec: payload.regenPerSec,
        points: payload.points,
      })
      this.emitToUserSocket(client, EVENTS.USER_UPDATE, payload)
      return payload
    } catch (err) {
      return this.errorAck(client, err)
    }
  }

  @SubscribeMessage(EVENTS.UPGRADE_AUTO_CLICKER)
  async handleUpgradeAutoClicker(
    @ConnectedSocket() client: Socket,
  ): Promise<SkillUpgradeAckPayload | { error: string }> {
    const userId = this.socketUserId.get(client)
    if (userId == null) {
      clickerLog('ws.in', {
        socket: client.id,
        event: EVENTS.UPGRADE_AUTO_CLICKER,
        op: 'no-auth',
      })
      return this.errorAck(client, 'Not authenticated')
    }
    clickerLog('ws.in', {
      socket: client.id,
      user: userId,
      event: EVENTS.UPGRADE_AUTO_CLICKER,
    })
    if (!this.checkUpgradeCooldown(client)) {
      clickerLog('ws.in', {
        socket: client.id,
        user: userId,
        event: EVENTS.UPGRADE_AUTO_CLICKER,
        op: 'cooldown-rejected',
      })
      return this.errorAck(client, 'Too many upgrade requests')
    }

    try {
      const ip = this.extractIp(client)
      const result = await this.clickerUserService.upgradeAutoClickerLevel(
        userId,
        ip,
      )
      const payload: SkillUpgradeAckPayload = {
        userId,
        skill: 'auto_clicker',
        level: result.auto_clicker_level.level,
        levelId: result.auto_clicker_level.id,
        points: result.points,
        durationSec: result.auto_clicker_level.duration_sec,
      }
      clickerLog('ws.out', {
        socket: client.id,
        user: userId,
        event: EVENTS.UPGRADE_AUTO_CLICKER_RESULT,
        new_level: payload.level,
        new_level_id: payload.levelId,
        duration_sec: payload.durationSec,
        points: payload.points,
      })
      this.emitToUserSocket(client, EVENTS.UPGRADE_AUTO_CLICKER_RESULT, payload)
      return payload
    } catch (err) {
      return this.errorAck(client, err)
    }
  }

  @SubscribeMessage(EVENTS.UPGRADE_CRIT_CLICK)
  async handleUpgradeCritClick(
    @ConnectedSocket() client: Socket,
  ): Promise<SkillUpgradeAckPayload | { error: string }> {
    const userId = this.socketUserId.get(client)
    if (userId == null) {
      clickerLog('ws.in', {
        socket: client.id,
        event: EVENTS.UPGRADE_CRIT_CLICK,
        op: 'no-auth',
      })
      return this.errorAck(client, 'Not authenticated')
    }
    clickerLog('ws.in', {
      socket: client.id,
      user: userId,
      event: EVENTS.UPGRADE_CRIT_CLICK,
    })
    if (!this.checkUpgradeCooldown(client)) {
      clickerLog('ws.in', {
        socket: client.id,
        user: userId,
        event: EVENTS.UPGRADE_CRIT_CLICK,
        op: 'cooldown-rejected',
      })
      return this.errorAck(client, 'Too many upgrade requests')
    }

    try {
      const ip = this.extractIp(client)
      const result = await this.clickerUserService.upgradeCritClickLevel(
        userId,
        ip,
      )
      const payload: SkillUpgradeAckPayload = {
        userId,
        skill: 'crit_click',
        level: result.crit_click_level.level,
        levelId: result.crit_click_level.id,
        points: result.points,
        critChancePct: result.crit_click_level.crit_chance_pct,
      }
      clickerLog('ws.out', {
        socket: client.id,
        user: userId,
        event: EVENTS.UPGRADE_CRIT_CLICK_RESULT,
        new_level: payload.level,
        new_level_id: payload.levelId,
        crit_chance_pct: payload.critChancePct,
        points: payload.points,
      })
      this.emitToUserSocket(client, EVENTS.UPGRADE_CRIT_CLICK_RESULT, payload)
      return payload
    } catch (err) {
      return this.errorAck(client, err)
    }
  }

  @SubscribeMessage(EVENTS.CLAIM_AUTO_CLICKER)
  async handleClaimAutoClicker(
    @ConnectedSocket() client: Socket,
  ): Promise<AutoClickerClaimAck | { error: string }> {
    const userId = this.socketUserId.get(client)
    if (userId == null) {
      clickerLog('ws.in', {
        socket: client.id,
        event: EVENTS.CLAIM_AUTO_CLICKER,
        op: 'no-auth',
      })
      return this.errorAck(client, 'Not authenticated')
    }
    clickerLog('ws.in', {
      socket: client.id,
      user: userId,
      event: EVENTS.CLAIM_AUTO_CLICKER,
    })
    // Same cooldown as upgrades. Atomicity is owned by the claim Lua
    // (concurrent calls serialise inside Redis); this is a perf
    // shortcut that lets us bounce a rapid double-tap before we touch
    // Redis.
    if (!this.checkUpgradeCooldown(client)) {
      clickerLog('ws.in', {
        socket: client.id,
        user: userId,
        event: EVENTS.CLAIM_AUTO_CLICKER,
        op: 'cooldown-rejected',
      })
      return this.errorAck(client, 'Too many claim requests')
    }

    try {
      const ip = this.extractIp(client)
      const result = await this.clickerUserService.claimAutoClicker(userId, ip)
      const payload: AutoClickerClaimAck = {
        userId,
        claimedCount: result.claimed_count,
        claimedValue: result.claimed_value,
        points: result.points,
        totalPoints: result.total_points,
      }
      clickerLog('ws.out', {
        socket: client.id,
        user: userId,
        event: EVENTS.CLAIM_AUTO_CLICKER_RESULT,
        claimed_count: payload.claimedCount,
        claimed_value: payload.claimedValue,
        points: payload.points,
        total_points: payload.totalPoints,
      })
      this.emitToUserSocket(client, EVENTS.CLAIM_AUTO_CLICKER_RESULT, payload)
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
      clickerLog('ws.in', {
        socket: client.id,
        event: EVENTS.GET_STATE,
        op: 'no-auth',
      })
      return this.errorAck(client, 'Not authenticated')
    }
    clickerLog('ws.in', {
      socket: client.id,
      user: userId,
      event: EVENTS.GET_STATE,
    })

    try {
      const state = await this.clickerUserService.getCurrentState(userId)
      const payload: UpgradeAckPayload = {
        userId,
        points: state.points,
        totalPoints: state.total_points,
        energy: state.energy,
        maxEnergy: state.max_energy,
        cost: state.cost,
        regenPerSec: state.regen_per_sec,
        level: state.level_id,
        clickLevel: state.click_level_id,
        energyLevel: state.energy_level_id,
        autoCredited: state.auto_credited,
        autoClickerStartedAtMs: state.auto_clicker_started_at_ms,
        autoClickerMaxIdleSec: state.auto_clicker_max_idle_sec,
        autoClickerPendingCount: state.auto_clicker_pending_count,
        autoClickerPendingValue: state.auto_clicker_pending_value,
      }
      clickerLog('ws.out', {
        socket: client.id,
        user: userId,
        event: EVENTS.STATE,
        op: 'get-state',
        points: payload.points,
        energy: payload.energy,
        max_energy: payload.maxEnergy,
        regen_per_sec: payload.regenPerSec,
        apc: payload.autoClickerPendingCount,
        apv: payload.autoClickerPendingValue,
        ac_started_at_ms: payload.autoClickerStartedAtMs,
        ac_max_idle_sec: payload.autoClickerMaxIdleSec,
      })
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

  /**
   * Returns true when the socket may proceed with an upgrade, false
   * when it's still inside the cooldown window. Per-socket because:
   *   - per-user would let one tab block another tab of the same user,
   *   - per-IP would let two players on the same NAT block each other.
   * The cooldown is purely a performance / DOS guard; the upgrade
   * method itself runs under SELECT FOR UPDATE so safety doesn't
   * depend on this check.
   */
  private checkUpgradeCooldown(client: Socket): boolean {
    const now = Date.now()
    const last = this.lastUpgradeAt.get(client) ?? 0
    if (now - last < UPGRADE_THROTTLE_MS) return false
    this.lastUpgradeAt.set(client, now)
    return true
  }

  /**
   * Best-effort client IP for the audit log. socket.io doesn't promise
   * real-IP through proxies — production behind a load balancer needs
   * trust-proxy + X-Forwarded-For. Falls back to null if unavailable.
   */
  private extractIp(client: Socket): string | null {
    const forwarded = client.handshake.headers['x-forwarded-for']
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      // X-Forwarded-For is a comma-separated chain — the LEFT-most is
      // the originating client; everything after is intermediate proxies.
      return forwarded.split(',')[0]?.trim() || null
    }
    return client.handshake.address || null
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
    clickerLog('ws.error', {
      socket: client.id,
      user: this.socketUserId.get(client) ?? null,
      message,
    })
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
