import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Not, Repository } from 'typeorm'
import Redis from 'ioredis'
import { User } from '../users/user.entity'
import { CaseHistory } from '../userHistory/entities/case-history.entity'
import { UpgradeHistory } from '../userHistory/entities/upgrade-history.entity'
import { MinesSession } from '../mines/entities/mines-session.entity'
import { CrashSession } from '../crash/entities/crash-session.entity'
import { VipRewardClaim } from '../vip/vip-reward-claim.entity'
import { REDIS_CLIENT } from '../../core/redis/redis.constants'
import { PresenceService } from '../../core/presence/presence.service'
import { GlobalStatsDto } from './dto/global-stats.dto'
import { UserStatsDto } from './dto/user-stats.dto'

// Bumped to v3: totals now include completed Mines and Crash sessions
// plus VIP case opens, not only regular cases and upgrades.
const CACHE_KEY = 'stats:global:v3'
const CACHE_TTL_SECONDS = 30

@Injectable()
export class StatsService {
  private readonly logger = new Logger(StatsService.name)

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(CaseHistory)
    private readonly caseHistoryRepository: Repository<CaseHistory>,
    @InjectRepository(UpgradeHistory)
    private readonly upgradeHistoryRepository: Repository<UpgradeHistory>,
    @InjectRepository(MinesSession)
    private readonly minesSessionRepository: Repository<MinesSession>,
    @InjectRepository(CrashSession)
    private readonly crashSessionRepository: Repository<CrashSession>,
    @InjectRepository(VipRewardClaim)
    private readonly vipRewardClaimRepository: Repository<VipRewardClaim>,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
    private readonly presenceService: PresenceService,
  ) {}

  async getGlobalStats(): Promise<GlobalStatsDto> {
    const cached = await this.readCache()
    if (cached) {
      return cached
    }

    const [
      online,
      players,
      casesPlayed,
      upgradesPlayed,
      minesPlayed,
      crashPlayed,
      vipCasesOpened,
      casesWon,
      upgradesWon,
      minesWon,
      crashWon,
      vipCasesWon,
    ] = await Promise.all([
      this.countOnlineUsers(),
      this.countTotalPlayers(),
      this.countCaseOpenings(),
      this.countUpgradeAttempts(),
      this.countCompletedMinesSessions(),
      this.countCompletedCrashSessions(),
      this.countVipCaseOpens(),
      this.sumCaseWinnings(),
      this.sumUpgradeWinnings(),
      this.sumMinesWinnings(),
      this.sumCrashWinnings(),
      this.sumVipCaseWinnings(),
    ])

    const stats: GlobalStatsDto = {
      online,
      players,
      totalGames:
        casesPlayed + upgradesPlayed + minesPlayed + crashPlayed + vipCasesOpened,
      won: Math.round(casesWon + upgradesWon + minesWon + crashWon + vipCasesWon),
    }

    await this.writeCache(stats)
    return stats
  }

  private async countOnlineUsers(): Promise<number> {
    // Real-time presence — every page load opens a Socket.IO connection
    // (LiveDrops feed in DefaultLayout), so the connected-socket count is
    // a faithful "online" signal regardless of whether the user has played
    // any games. Counts anonymous visitors too, which is what footer
    // "online" counters typically advertise.
    return this.presenceService.getOnlineCount()
  }

  private async countTotalPlayers(): Promise<number> {
    return this.userRepository.count()
  }

  private async countCaseOpenings(): Promise<number> {
    // Case rows are event-aggregated — `total_drops` carries the per-event
    // count, so summing it gives the true number of boxes opened.
    const result = await this.caseHistoryRepository
      .createQueryBuilder('c')
      .select('COALESCE(SUM(c.total_drops), 0)', 'count')
      .getRawOne<{ count: string }>()
    return Number(result?.count ?? 0)
  }

  private async countUpgradeAttempts(): Promise<number> {
    return this.upgradeHistoryRepository.count()
  }

  private async countCompletedMinesSessions(): Promise<number> {
    return this.minesSessionRepository.count({
      where: { status: Not('active') },
    })
  }

  private async countCompletedCrashSessions(): Promise<number> {
    return this.crashSessionRepository.count({
      where: { status: Not('active') },
    })
  }

  private async countVipCaseOpens(): Promise<number> {
    return this.vipRewardClaimRepository.count({
      where: { reward_type: 'vip_case_open' },
    })
  }

  private async sumCaseWinnings(): Promise<number> {
    // `drops` is a JSONB array of { skin_price, ... }. Unnest it once and
    // sum across all rows. Legacy rows (pre event-aggregation migration)
    // still carry the per-row `skin_price` column with `drops = NULL`, so
    // we add their contribution from the flat column to keep the historical
    // total accurate.
    const dropsResult = await this.caseHistoryRepository.manager.query<
      { total: string | null }[]
    >(
      `SELECT COALESCE(SUM((d->>'skin_price')::numeric), 0) AS total
         FROM case_history c, jsonb_array_elements(c.drops) AS d
        WHERE c.drops IS NOT NULL`,
    )

    const legacyResult = await this.caseHistoryRepository
      .createQueryBuilder('c')
      .select('COALESCE(SUM(c.skin_price), 0)', 'total')
      .where('c.drops IS NULL')
      .getRawOne<{ total: string }>()

    const fromDrops = Number(dropsResult?.[0]?.total ?? 0)
    const fromLegacy = Number(legacyResult?.total ?? 0)
    return fromDrops + fromLegacy
  }

  private async sumUpgradeWinnings(): Promise<number> {
    const result = await this.upgradeHistoryRepository
      .createQueryBuilder('u')
      .select('COALESCE(SUM(u.skin_price), 0)', 'total')
      .where('u.success = true')
      .getRawOne<{ total: string }>()
    return Number(result?.total ?? 0)
  }

  private async sumMinesWinnings(): Promise<number> {
    const result = await this.minesSessionRepository
      .createQueryBuilder('m')
      .select('COALESCE(SUM(m.win_amount), 0)', 'total')
      .where('m.status = :status', { status: 'cashed_out' })
      .getRawOne<{ total: string }>()
    return Number(result?.total ?? 0)
  }

  private async sumCrashWinnings(): Promise<number> {
    const result = await this.crashSessionRepository
      .createQueryBuilder('c')
      .select('COALESCE(SUM(c.win_amount), 0)', 'total')
      .where('c.status = :status', { status: 'cashed_out' })
      .getRawOne<{ total: string }>()
    return Number(result?.total ?? 0)
  }

  private async sumVipCaseWinnings(): Promise<number> {
    const result = await this.vipRewardClaimRepository
      .createQueryBuilder('v')
      .select('COALESCE(SUM(v.amount), 0)', 'total')
      .where('v.reward_type = :rewardType', { rewardType: 'vip_case_open' })
      .getRawOne<{ total: string }>()
    return Number(result?.total ?? 0)
  }

  /**
   * Per-user counters for the profile page. Same shape as global stats but
   * scoped to one user_id. No cache layer here — the profile page is hit
   * far less than the footer, and the queries are user-scoped (small index
   * range), so the cost is fine to pay live.
   */
  async getUserStats(userId: number): Promise<UserStatsDto> {
    const [
      casesPlayed,
      upgradesPlayed,
      caseWinnings,
      legacyCaseWinnings,
      upgradeWinnings,
      minesPlayed,
      crashPlayed,
      vipCasesOpened,
      minesWinnings,
      crashWinnings,
      vipCaseWinnings,
      caseDropTopWin,
      legacyCaseTopWin,
      upgradeTopWin,
      minesTopWin,
      crashTopWin,
      vipCaseTopWin,
    ] = await Promise.all([
      this.countUserCaseOpenings(userId),
      this.countUserUpgradeAttempts(userId),
      this.sumUserCaseDropWinnings(userId),
      this.sumUserLegacyCaseWinnings(userId),
      this.sumUserUpgradeWinnings(userId),
      this.countUserCompletedMinesSessions(userId),
      this.countUserCompletedCrashSessions(userId),
      this.countUserVipCaseOpens(userId),
      this.sumUserMinesWinnings(userId),
      this.sumUserCrashWinnings(userId),
      this.sumUserVipCaseWinnings(userId),
      this.maxUserCaseDropWin(userId),
      this.maxUserLegacyCaseWin(userId),
      this.maxUserUpgradeWin(userId),
      this.maxUserMinesWin(userId),
      this.maxUserCrashWin(userId),
      this.maxUserVipCaseWin(userId),
    ])

    const totalWon =
      caseWinnings +
      legacyCaseWinnings +
      upgradeWinnings +
      minesWinnings +
      crashWinnings +
      vipCaseWinnings
    const topWin = Math.max(
      caseDropTopWin,
      legacyCaseTopWin,
      upgradeTopWin,
      minesTopWin,
      crashTopWin,
      vipCaseTopWin,
      0,
    )

    return {
      gamesPlayed:
        casesPlayed + upgradesPlayed + minesPlayed + crashPlayed + vipCasesOpened,
      totalWon: Number(totalWon.toFixed(2)),
      topWin: Number(topWin.toFixed(2)),
    }
  }

  private async countUserCaseOpenings(userId: number): Promise<number> {
    const result = await this.caseHistoryRepository
      .createQueryBuilder('c')
      .select('COALESCE(SUM(c.total_drops), 0)', 'count')
      .where('c.user_id = :userId', { userId })
      .getRawOne<{ count: string }>()
    return Number(result?.count ?? 0)
  }

  private async countUserUpgradeAttempts(userId: number): Promise<number> {
    return this.upgradeHistoryRepository.count({ where: { user_id: userId } })
  }

  private async countUserCompletedMinesSessions(userId: number): Promise<number> {
    return this.minesSessionRepository.count({
      where: { user_id: userId, status: Not('active') },
    })
  }

  private async countUserCompletedCrashSessions(userId: number): Promise<number> {
    return this.crashSessionRepository.count({
      where: { user_id: userId, status: Not('active') },
    })
  }

  private async countUserVipCaseOpens(userId: number): Promise<number> {
    return this.vipRewardClaimRepository.count({
      where: { user_id: userId, reward_type: 'vip_case_open' },
    })
  }

  private async sumUserCaseDropWinnings(userId: number): Promise<number> {
    const result = await this.caseHistoryRepository.manager.query<
      { total: string | null }[]
    >(
      `SELECT COALESCE(SUM((d->>'skin_price')::numeric), 0) AS total
         FROM case_history c, jsonb_array_elements(c.drops) AS d
        WHERE c.user_id = $1 AND c.drops IS NOT NULL`,
      [userId],
    )
    return Number(result?.[0]?.total ?? 0)
  }

  private async sumUserLegacyCaseWinnings(userId: number): Promise<number> {
    const result = await this.caseHistoryRepository
      .createQueryBuilder('c')
      .select('COALESCE(SUM(c.skin_price), 0)', 'total')
      .where('c.user_id = :userId AND c.drops IS NULL', { userId })
      .getRawOne<{ total: string }>()
    return Number(result?.total ?? 0)
  }

  private async sumUserUpgradeWinnings(userId: number): Promise<number> {
    const result = await this.upgradeHistoryRepository
      .createQueryBuilder('u')
      .select('COALESCE(SUM(u.skin_price), 0)', 'total')
      .where('u.user_id = :userId AND u.success = true', { userId })
      .getRawOne<{ total: string }>()
    return Number(result?.total ?? 0)
  }

  private async sumUserMinesWinnings(userId: number): Promise<number> {
    const result = await this.minesSessionRepository
      .createQueryBuilder('m')
      .select('COALESCE(SUM(m.win_amount), 0)', 'total')
      .where('m.user_id = :userId AND m.status = :status', {
        userId,
        status: 'cashed_out',
      })
      .getRawOne<{ total: string }>()
    return Number(result?.total ?? 0)
  }

  private async sumUserCrashWinnings(userId: number): Promise<number> {
    const result = await this.crashSessionRepository
      .createQueryBuilder('c')
      .select('COALESCE(SUM(c.win_amount), 0)', 'total')
      .where('c.user_id = :userId AND c.status = :status', {
        userId,
        status: 'cashed_out',
      })
      .getRawOne<{ total: string }>()
    return Number(result?.total ?? 0)
  }

  private async sumUserVipCaseWinnings(userId: number): Promise<number> {
    const result = await this.vipRewardClaimRepository
      .createQueryBuilder('v')
      .select('COALESCE(SUM(v.amount), 0)', 'total')
      .where('v.user_id = :userId AND v.reward_type = :rewardType', {
        userId,
        rewardType: 'vip_case_open',
      })
      .getRawOne<{ total: string }>()
    return Number(result?.total ?? 0)
  }

  private async maxUserCaseDropWin(userId: number): Promise<number> {
    const result = await this.caseHistoryRepository.manager.query<
      { max: string | null }[]
    >(
      `SELECT MAX((d->>'skin_price')::numeric) AS max
         FROM case_history c, jsonb_array_elements(c.drops) AS d
        WHERE c.user_id = $1 AND c.drops IS NOT NULL`,
      [userId],
    )
    return Number(result?.[0]?.max ?? 0)
  }

  private async maxUserLegacyCaseWin(userId: number): Promise<number> {
    const result = await this.caseHistoryRepository
      .createQueryBuilder('c')
      .select('MAX(c.skin_price)', 'max')
      .where('c.user_id = :userId AND c.drops IS NULL', { userId })
      .getRawOne<{ max: string | null }>()
    return Number(result?.max ?? 0)
  }

  private async maxUserUpgradeWin(userId: number): Promise<number> {
    const result = await this.upgradeHistoryRepository
      .createQueryBuilder('u')
      .select('MAX(u.skin_price)', 'max')
      .where('u.user_id = :userId AND u.success = true', { userId })
      .getRawOne<{ max: string | null }>()
    return Number(result?.max ?? 0)
  }

  private async maxUserMinesWin(userId: number): Promise<number> {
    const result = await this.minesSessionRepository
      .createQueryBuilder('m')
      .select('MAX(m.win_amount)', 'max')
      .where('m.user_id = :userId AND m.status = :status', {
        userId,
        status: 'cashed_out',
      })
      .getRawOne<{ max: string | null }>()
    return Number(result?.max ?? 0)
  }

  private async maxUserCrashWin(userId: number): Promise<number> {
    const result = await this.crashSessionRepository
      .createQueryBuilder('c')
      .select('MAX(c.win_amount)', 'max')
      .where('c.user_id = :userId AND c.status = :status', {
        userId,
        status: 'cashed_out',
      })
      .getRawOne<{ max: string | null }>()
    return Number(result?.max ?? 0)
  }

  private async maxUserVipCaseWin(userId: number): Promise<number> {
    const result = await this.vipRewardClaimRepository
      .createQueryBuilder('v')
      .select('MAX(v.amount)', 'max')
      .where('v.user_id = :userId AND v.reward_type = :rewardType', {
        userId,
        rewardType: 'vip_case_open',
      })
      .getRawOne<{ max: string | null }>()
    return Number(result?.max ?? 0)
  }

  private async readCache(): Promise<GlobalStatsDto | null> {
    try {
      const raw = await this.redis.get(CACHE_KEY)
      return raw ? (JSON.parse(raw) as GlobalStatsDto) : null
    } catch (err) {
      this.logger.warn(`stats cache read failed: ${(err as Error).message}`)
      return null
    }
  }

  private async writeCache(stats: GlobalStatsDto): Promise<void> {
    try {
      await this.redis.set(
        CACHE_KEY,
        JSON.stringify(stats),
        'EX',
        CACHE_TTL_SECONDS,
      )
    } catch (err) {
      this.logger.warn(`stats cache write failed: ${(err as Error).message}`)
    }
  }
}
