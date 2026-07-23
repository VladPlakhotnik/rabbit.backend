import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common'
import { BotProfileService } from '../bots/bot-profile.service'
import { BotProfileSnapshot, roundBotMoney } from '../bots/bot-behavior.logic'
import {
  buildCrashBotParticipant,
  cashOutDueParticipants,
  CrashLiveParticipant,
  CrashLivePhase,
  generateCrashPoint,
  pickCrashParticipantCount,
  getVisibleCrashParticipants,
  getCrashRoundMultiplier,
  scheduleCrashParticipantJoins,
  settleCrashParticipants,
} from './crash-live.logic'
import {
  CRASH_LIVE_HISTORY_LIMIT,
  CRASH_LIVE_RESET_MS,
  CRASH_LIVE_TICK_MS,
  CRASH_LIVE_WAIT_MS,
} from './crash-live.constants'
import type { CrashLiveSnapshot, CrashLiveStateHandler } from './crash-live.types'
import { areBotsDisabled } from '../../core/config/background-jobs'

const INITIAL_HISTORY = [
  1.53, 0.87, 3.41, 1.12, 2.74, 0.96, 5.28, 1.75, 2.02, 1.33, 8.18, 1.07,
]

@Injectable()
export class CrashLiveService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(CrashLiveService.name)
  private timer: NodeJS.Timeout | null = null
  private readonly handlers = new Set<CrashLiveStateHandler>()
  private phase: CrashLivePhase = 'waiting'
  private roundId = 1
  private phaseStartedAt = Date.now()
  private currentMultiplier = 1
  private countdownMs = CRASH_LIVE_WAIT_MS
  private crashPoint: number | null = null
  private participants: CrashLiveParticipant[] = []
  private roundHistory = [...INITIAL_HISTORY]
  private isShuttingDown = false

  constructor(private readonly botProfileService: BotProfileService) {}

  async onApplicationBootstrap(): Promise<void> {
    if (areBotsDisabled()) {
      this.logger.log('Crash live bots disabled via env')
      return
    }

    await this.startWaitingRound(1)
    this.timer = setInterval(() => {
      void this.tick()
    }, CRASH_LIVE_TICK_MS)
    this.logger.log('Crash live service started')
  }

  onModuleDestroy(): void {
    this.isShuttingDown = true

    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  onState(handler: CrashLiveStateHandler): () => void {
    this.handlers.add(handler)

    return () => {
      this.handlers.delete(handler)
    }
  }

  getSnapshot(): CrashLiveSnapshot {
    const elapsedMs = Date.now() - this.phaseStartedAt
    const visibleParticipants = getVisibleCrashParticipants(
      this.participants,
      elapsedMs,
      this.phase,
    )
    const pot = roundBotMoney(
      visibleParticipants.reduce((sum, participant) => sum + participant.stake, 0),
    )

    return {
      roundId: this.roundId,
      phase: this.phase,
      currentMultiplier: this.currentMultiplier,
      countdownMs: this.countdownMs,
      crashPoint: this.crashPoint,
      participants: visibleParticipants,
      roundHistory: this.roundHistory,
      pot,
      participantCount: visibleParticipants.length,
      serverTime: Date.now(),
    }
  }

  private async tick(): Promise<void> {
    if (this.isShuttingDown) return

    const now = Date.now()
    const elapsedMs = now - this.phaseStartedAt

    if (this.phase === 'waiting') {
      this.countdownMs = Math.max(0, CRASH_LIVE_WAIT_MS - elapsedMs)

      if (this.countdownMs <= 0) {
        this.phase = 'running'
        this.phaseStartedAt = now
        this.currentMultiplier = 1
        this.crashPoint = generateCrashPoint()
      }

      this.publish()
      return
    }

    if (this.phase === 'running') {
      this.currentMultiplier = getCrashRoundMultiplier(elapsedMs)
      this.participants = cashOutDueParticipants(
        this.participants,
        this.currentMultiplier,
      )

      if (this.crashPoint !== null && this.currentMultiplier >= this.crashPoint) {
        this.currentMultiplier = this.crashPoint
        this.participants = settleCrashParticipants(
          this.participants,
          this.crashPoint,
        )
        this.roundHistory = [
          this.crashPoint,
          ...this.roundHistory,
        ].slice(0, CRASH_LIVE_HISTORY_LIMIT)
        this.phase = 'crashed'
        this.phaseStartedAt = now
      }

      this.publish()
      return
    }

    if (this.phase === 'crashed' && elapsedMs >= CRASH_LIVE_RESET_MS) {
      await this.startWaitingRound(this.roundId + 1)
    }

    this.publish()
  }

  private publish(): void {
    const snapshot = this.getSnapshot()

    for (const handler of this.handlers) {
      try {
        handler(snapshot)
      } catch (err) {
        this.logger.error(
          `Crash live handler failed: ${(err as Error).message}`,
          (err as Error).stack,
        )
      }
    }
  }

  private async startWaitingRound(nextRoundId: number): Promise<void> {
    this.roundId = nextRoundId
    this.phase = 'waiting'
    this.phaseStartedAt = Date.now()
    this.countdownMs = CRASH_LIVE_WAIT_MS
    this.currentMultiplier = 1
    this.crashPoint = null
    this.participants = await this.buildRoundParticipants(nextRoundId)
    this.publish()
  }

  private async buildRoundParticipants(
    roundId: number,
  ): Promise<CrashLiveParticipant[]> {
    const profiles = await this.botProfileService.getBotProfiles()

    if (profiles.length === 0) {
      this.logger.warn('No bot profiles for crash live round')
      return []
    }

    const targetCount = pickCrashParticipantCount()
    const shuffled = this.shuffleProfiles(profiles)
    const picked = Array.from({ length: targetCount }, (_, index) => {
      const profile = shuffled[index % shuffled.length]

      return buildCrashBotParticipant({
        profile,
        roundId,
        slot: index + 1,
      })
    })

    return scheduleCrashParticipantJoins(
      picked.sort((a, b) => b.stake - a.stake),
      CRASH_LIVE_WAIT_MS,
    )
  }

  private shuffleProfiles(
    profiles: readonly BotProfileSnapshot[],
  ): BotProfileSnapshot[] {
    const shuffled = [...profiles]

    for (let index = shuffled.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(Math.random() * (index + 1))
      const current = shuffled[index]
      shuffled[index] = shuffled[swapIndex]
      shuffled[swapIndex] = current
    }

    return shuffled
  }
}
