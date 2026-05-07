import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { User } from '../users/user.entity'
import { PlayerRole } from '../users/player-role.enum'
import {
  BotProfileSnapshot,
  BotUserSnapshot,
  buildDefaultBotProfile,
} from './bot-behavior.logic'
import { BotProfile } from './entities/bot-profile.entity'

const BOT_CACHE_TTL_MS = 60_000

@Injectable()
export class BotProfileService {
  private readonly logger = new Logger(BotProfileService.name)
  private cache: { bots: BotProfileSnapshot[]; loadedAt: number } | null = null

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(BotProfile)
    private readonly profileRepository: Repository<BotProfile>,
  ) {}

  async getBotProfiles(): Promise<BotProfileSnapshot[]> {
    const now = Date.now()

    if (this.cache && now - this.cache.loadedAt < BOT_CACHE_TTL_MS) {
      return this.cache.bots
    }

    const users = await this.userRepository.find({
      where: { role: PlayerRole.BOT },
      select: ['id', 'display_name', 'avatar'],
      order: { id: 'ASC' },
    })
    const snapshots = users
      .filter(user => user.display_name)
      .map(user => ({
        id: user.id,
        display_name: user.display_name,
        avatar: user.avatar,
      }))

    if (snapshots.length === 0) {
      this.cache = { bots: [], loadedAt: now }
      return []
    }

    const profiles = await this.profileRepository.find({
      where: { user_id: In(snapshots.map(bot => bot.id)) },
    })
    const profileByUserId = new Map(
      profiles.map(profile => [profile.user_id, profile]),
    )
    const bots = snapshots.map(bot =>
      this.mergeStoredProfile(bot, profileByUserId.get(bot.id)),
    )

    this.cache = { bots, loadedAt: now }
    return bots
  }

  async pickBotProfile(
    random: () => number = Math.random,
  ): Promise<BotProfileSnapshot | null> {
    const bots = await this.getBotProfiles()

    if (bots.length === 0) {
      this.logger.warn('No bot users available')
      return null
    }

    return bots[Math.min(bots.length - 1, Math.floor(random() * bots.length))]
  }

  clearCache(): void {
    this.cache = null
  }

  private mergeStoredProfile(
    bot: BotUserSnapshot,
    storedProfile?: BotProfile,
  ): BotProfileSnapshot {
    const fallback = buildDefaultBotProfile(bot)

    if (!storedProfile) {
      return fallback
    }

    return {
      ...fallback,
      wealthTier: storedProfile.wealth_tier,
      archetype: storedProfile.archetype,
      favoriteGame: storedProfile.favorite_game,
      virtualBankroll: Number(storedProfile.virtual_bankroll),
      minStake: Number(storedProfile.min_stake),
      maxStake: Number(storedProfile.max_stake),
      riskAppetite: Number(storedProfile.risk_appetite),
      patience: Number(storedProfile.patience),
      impulsivity: Number(storedProfile.impulsivity),
      lossChasing: Number(storedProfile.loss_chasing),
      confidence: Number(storedProfile.confidence),
    }
  }
}
