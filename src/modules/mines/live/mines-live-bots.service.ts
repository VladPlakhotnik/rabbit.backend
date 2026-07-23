import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common'
import {
  buildMinesBotDropPayload,
  pickMinesBotDelayMs,
} from './mines-live-bots.logic'
import { MinesLiveService } from './mines-live.service'
import { BotProfileService } from '../../bots/bot-profile.service'
import { areBotsDisabled } from '../../../core/config/background-jobs'

@Injectable()
export class MinesLiveBotsService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(MinesLiveBotsService.name)
  private timeout: NodeJS.Timeout | null = null
  private isShuttingDown = false

  constructor(
    private readonly minesLiveService: MinesLiveService,
    private readonly botProfileService: BotProfileService,
  ) {}

  onApplicationBootstrap(): void {
    if (
      areBotsDisabled() ||
      process.env.DISABLE_MINES_BOTS === 'true'
    ) {
      this.logger.log('Mines bots disabled via env')
      return
    }

    this.scheduleNext()
    this.logger.log('Mines live bots started')
  }

  onModuleDestroy(): void {
    this.isShuttingDown = true

    if (this.timeout) {
      clearTimeout(this.timeout)
      this.timeout = null
    }
  }

  private scheduleNext(): void {
    if (this.isShuttingDown) return

    this.timeout = setTimeout(() => {
      void this.runBotTick().finally(() => this.scheduleNext())
    }, pickMinesBotDelayMs())
  }

  private async runBotTick(): Promise<void> {
    if (this.isShuttingDown) return

    try {
      const bot = await this.botProfileService.pickBotProfile()

      if (!bot) {
        this.logger.warn('No mines bot users available - skipping bot tick')
        return
      }

      await this.minesLiveService.pushDrop(
        buildMinesBotDropPayload(bot),
      )
    } catch (err) {
      this.logger.error(
        `Mines bot tick failed: ${(err as Error).message}`,
        (err as Error).stack,
      )
    }
  }
}
