import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { PresenceService } from '../../../core/presence/presence.service'

interface AmountSummary {
  count: number
  amount: number
}

interface DepositSummary {
  activeDepositors: number
  averageSuccessDeposit: number
  cancelled: AmountSummary
  error: AmountSummary
  success: AmountSummary
  total: AmountSummary
  waiting: AmountSummary
}

interface WithdrawalSummary {
  actualAmount: number
  completed: number
  failed: number
  inFlight: number
  pending: number
  targetAmount: number
  total: number
}

interface UserSummary {
  activePlayers: number
  newUsers: number
  totalBalance: number
  totalUsers: number
}

interface GameVerticalSummary {
  activePlayers: number
  ggr: number
  key: 'cases' | 'upgrades' | 'mines' | 'crash' | 'total'
  margin: number
  payout: number
  rounds: number
  wagered: number
}

interface DailyTrendPoint {
  date: string
  deposits: number
  gameRounds: number
  netCashflow: number
  newUsers: number
  withdrawals: number
}

const PERIOD_DAYS = 30
const TREND_DAYS = 14

@Injectable()
export class AdminAnalyticsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly presenceService: PresenceService,
  ) {}

  async getInvestorAnalytics() {
    const now = new Date()
    const periodFrom = this.addDays(now, -PERIOD_DAYS)
    const previousFrom = this.addDays(periodFrom, -PERIOD_DAYS)
    const trendFrom = this.startOfUtcDay(this.addDays(now, -(TREND_DAYS - 1)))

    const [
      deposits,
      previousDeposits,
      withdrawals,
      previousWithdrawals,
      users,
      previousUsers,
      cases,
      previousCases,
      upgrades,
      previousUpgrades,
      mines,
      previousMines,
      crash,
      previousCrash,
      trend,
      onlineUsers,
    ] = await Promise.all([
      this.getDepositSummary(periodFrom, now),
      this.getDepositSummary(previousFrom, periodFrom),
      this.getWithdrawalSummary(periodFrom, now),
      this.getWithdrawalSummary(previousFrom, periodFrom),
      this.getUserSummary(periodFrom, now),
      this.getUserSummary(previousFrom, periodFrom),
      this.getCasesSummary(periodFrom, now),
      this.getCasesSummary(previousFrom, periodFrom),
      this.getUpgradeSummary(periodFrom, now),
      this.getUpgradeSummary(previousFrom, periodFrom),
      this.getMinesSummary(periodFrom, now),
      this.getMinesSummary(previousFrom, periodFrom),
      this.getCrashSummary(periodFrom, now),
      this.getCrashSummary(previousFrom, periodFrom),
      this.getDailyTrend(trendFrom, now),
      this.presenceService.getOnlineCount(),
    ])

    const verticals = [cases, upgrades, mines, crash]
    const previousVerticals = [
      previousCases,
      previousUpgrades,
      previousMines,
      previousCrash,
    ]
    const gamesTotal = this.combineVerticals(verticals)
    const previousGamesTotal = this.combineVerticals(previousVerticals)
    const netCashflow = deposits.success.amount - withdrawals.actualAmount
    const previousNetCashflow =
      previousDeposits.success.amount - previousWithdrawals.actualAmount
    const arpu =
      users.activePlayers > 0
        ? deposits.success.amount / users.activePlayers
        : 0
    const conversionRate =
      users.newUsers > 0
        ? (deposits.activeDepositors / users.newUsers) * 100
        : 0
    const payoutRatio =
      gamesTotal.wagered > 0
        ? (gamesTotal.payout / gamesTotal.wagered) * 100
        : 0

    return {
      generated_at: now.toISOString(),
      period: {
        days: PERIOD_DAYS,
        from: periodFrom.toISOString(),
        to: now.toISOString(),
      },
      kpis: {
        activeDepositors: deposits.activeDepositors,
        activePlayers: users.activePlayers,
        arpu: this.roundMoney(arpu),
        averageDeposit: deposits.averageSuccessDeposit,
        conversionRate: this.roundPercent(conversionRate),
        depositVolume: deposits.success.amount,
        grossGamingRevenue: gamesTotal.ggr,
        netCashflow: this.roundMoney(netCashflow),
        newUsers: users.newUsers,
        payoutRatio: this.roundPercent(payoutRatio),
      },
      growth: {
        activePlayers: this.percentChange(
          users.activePlayers,
          previousUsers.activePlayers,
        ),
        depositVolume: this.percentChange(
          deposits.success.amount,
          previousDeposits.success.amount,
        ),
        grossGamingRevenue: this.percentChange(
          gamesTotal.ggr,
          previousGamesTotal.ggr,
        ),
        netCashflow: this.percentChange(netCashflow, previousNetCashflow),
        newUsers: this.percentChange(users.newUsers, previousUsers.newUsers),
      },
      finance: {
        deposits,
        withdrawals,
      },
      games: {
        byVertical: verticals,
        total: gamesTotal,
      },
      users: {
        ...users,
        online: onlineUsers,
      },
      trend,
    }
  }

  private async getDepositSummary(
    from: Date,
    to: Date,
  ): Promise<DepositSummary> {
    const [raw] = await this.dataSource.query(
      `
        SELECT
          COUNT(*) AS total_count,
          COALESCE(SUM(amount), 0) AS total_amount,
          COUNT(*) FILTER (WHERE status = 'success') AS success_count,
          COALESCE(SUM(amount) FILTER (WHERE status = 'success'), 0) AS success_amount,
          COUNT(DISTINCT user_id) FILTER (WHERE status = 'success') AS active_depositors,
          COUNT(*) FILTER (WHERE status = 'waiting') AS waiting_count,
          COALESCE(SUM(amount) FILTER (WHERE status = 'waiting'), 0) AS waiting_amount,
          COUNT(*) FILTER (WHERE status = 'error') AS error_count,
          COALESCE(SUM(amount) FILTER (WHERE status = 'error'), 0) AS error_amount,
          COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_count,
          COALESCE(SUM(amount) FILTER (WHERE status = 'cancelled'), 0) AS cancelled_amount
        FROM user_deposits
        WHERE created_at >= $1 AND created_at < $2
      `,
      [from, to],
    )

    const successCount = this.toNumber(raw?.success_count)
    const successAmount = this.toMoney(raw?.success_amount)

    return {
      activeDepositors: this.toNumber(raw?.active_depositors),
      averageSuccessDeposit:
        successCount > 0 ? this.roundMoney(successAmount / successCount) : 0,
      cancelled: this.amountSummary(
        raw?.cancelled_count,
        raw?.cancelled_amount,
      ),
      error: this.amountSummary(raw?.error_count, raw?.error_amount),
      success: { count: successCount, amount: successAmount },
      total: this.amountSummary(raw?.total_count, raw?.total_amount),
      waiting: this.amountSummary(raw?.waiting_count, raw?.waiting_amount),
    }
  }

  private async getWithdrawalSummary(
    from: Date,
    to: Date,
  ): Promise<WithdrawalSummary> {
    const [raw] = await this.dataSource.query(
      `
        SELECT
          COUNT(*) AS total_count,
          COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
          COUNT(*) FILTER (WHERE status IN ('purchasing', 'delivering')) AS in_flight_count,
          COUNT(*) FILTER (WHERE status = 'completed') AS completed_count,
          COUNT(*) FILTER (WHERE status = 'failed') AS failed_count,
          COALESCE(SUM(target_price), 0) AS target_amount,
          COALESCE(SUM(actual_price) FILTER (WHERE status = 'completed'), 0) AS actual_amount
        FROM withdrawals
        WHERE created_at >= $1 AND created_at < $2
      `,
      [from, to],
    )

    return {
      actualAmount: this.toMoney(raw?.actual_amount),
      completed: this.toNumber(raw?.completed_count),
      failed: this.toNumber(raw?.failed_count),
      inFlight: this.toNumber(raw?.in_flight_count),
      pending: this.toNumber(raw?.pending_count),
      targetAmount: this.toMoney(raw?.target_amount),
      total: this.toNumber(raw?.total_count),
    }
  }

  private async getUserSummary(from: Date, to: Date): Promise<UserSummary> {
    const [raw] = await this.dataSource.query(
      `
        WITH active_users AS (
          SELECT user_id FROM user_deposits WHERE created_at >= $1 AND created_at < $2
          UNION SELECT user_id FROM case_history WHERE created_at >= $1 AND created_at < $2
          UNION SELECT user_id FROM upgrade_history WHERE created_at >= $1 AND created_at < $2
          UNION SELECT user_id FROM mines_sessions WHERE created_at >= $1 AND created_at < $2
          UNION SELECT user_id FROM crash_sessions WHERE created_at >= $1 AND created_at < $2
        )
        SELECT
          COUNT(*) AS total_users,
          COUNT(*) FILTER (WHERE created_at >= $1 AND created_at < $2) AS new_users,
          COALESCE(SUM(balance), 0) AS total_balance,
          (SELECT COUNT(*) FROM active_users) AS active_players
        FROM users
      `,
      [from, to],
    )

    return {
      activePlayers: this.toNumber(raw?.active_players),
      newUsers: this.toNumber(raw?.new_users),
      totalBalance: this.toMoney(raw?.total_balance),
      totalUsers: this.toNumber(raw?.total_users),
    }
  }

  private async getCasesSummary(
    from: Date,
    to: Date,
  ): Promise<GameVerticalSummary> {
    const [raw] = await this.dataSource.query(
      `
        WITH base AS (
          SELECT
            COALESCE(SUM(COALESCE(total_drops, 1)), 0) AS rounds,
            COALESCE(SUM(COALESCE(total_cost, case_price * COALESCE(total_drops, 1))), 0) AS wagered,
            COUNT(DISTINCT user_id) AS active_players
          FROM case_history
          WHERE created_at >= $1 AND created_at < $2
        ),
        drop_payouts AS (
          SELECT COALESCE(SUM((drop_item->>'skin_price')::numeric), 0) AS payout
          FROM case_history c
          CROSS JOIN LATERAL jsonb_array_elements(c.drops) AS drop_item
          WHERE c.drops IS NOT NULL AND c.created_at >= $1 AND c.created_at < $2
        ),
        legacy_payouts AS (
          SELECT COALESCE(SUM(skin_price), 0) AS payout
          FROM case_history
          WHERE drops IS NULL AND created_at >= $1 AND created_at < $2
        )
        SELECT
          base.rounds,
          base.wagered,
          base.active_players,
          drop_payouts.payout + legacy_payouts.payout AS payout
        FROM base, drop_payouts, legacy_payouts
      `,
      [from, to],
    )

    return this.verticalSummary('cases', raw)
  }

  private async getUpgradeSummary(
    from: Date,
    to: Date,
  ): Promise<GameVerticalSummary> {
    const [raw] = await this.dataSource.query(
      `
        SELECT
          COUNT(*) AS rounds,
          COALESCE(SUM(cost), 0) AS wagered,
          COUNT(DISTINCT user_id) AS active_players,
          COALESCE(SUM(skin_price) FILTER (WHERE success IS TRUE), 0) AS payout
        FROM upgrade_history
        WHERE created_at >= $1 AND created_at < $2
      `,
      [from, to],
    )

    return this.verticalSummary('upgrades', raw)
  }

  private async getMinesSummary(
    from: Date,
    to: Date,
  ): Promise<GameVerticalSummary> {
    const [raw] = await this.dataSource.query(
      `
        SELECT
          COUNT(*) AS rounds,
          COALESCE(SUM(bet_amount), 0) AS wagered,
          COUNT(DISTINCT user_id) AS active_players,
          COALESCE(SUM(win_amount) FILTER (WHERE status = 'cashed_out'), 0) AS payout
        FROM mines_sessions
        WHERE status <> 'active' AND created_at >= $1 AND created_at < $2
      `,
      [from, to],
    )

    return this.verticalSummary('mines', raw)
  }

  private async getCrashSummary(
    from: Date,
    to: Date,
  ): Promise<GameVerticalSummary> {
    const [raw] = await this.dataSource.query(
      `
        SELECT
          COUNT(*) AS rounds,
          COALESCE(SUM(stake_amount), 0) AS wagered,
          COUNT(DISTINCT user_id) AS active_players,
          COALESCE(SUM(win_amount) FILTER (WHERE status = 'cashed_out'), 0) AS payout
        FROM crash_sessions
        WHERE status <> 'active' AND created_at >= $1 AND created_at < $2
      `,
      [from, to],
    )

    return this.verticalSummary('crash', raw)
  }

  private async getDailyTrend(
    from: Date,
    to: Date,
  ): Promise<DailyTrendPoint[]> {
    const days = new Map<string, DailyTrendPoint>()

    for (let day = new Date(from); day <= to; day = this.addDays(day, 1)) {
      const key = day.toISOString().slice(0, 10)
      days.set(key, {
        date: key,
        deposits: 0,
        gameRounds: 0,
        netCashflow: 0,
        newUsers: 0,
        withdrawals: 0,
      })
    }

    const [depositRows, withdrawalRows, userRows, gameRows] = await Promise.all(
      [
        this.dataSource.query(
          `
          SELECT date_trunc('day', created_at)::date AS day,
                 COALESCE(SUM(amount) FILTER (WHERE status = 'success'), 0) AS deposits
          FROM user_deposits
          WHERE created_at >= $1 AND created_at < $2
          GROUP BY 1
        `,
          [from, to],
        ),
        this.dataSource.query(
          `
          SELECT date_trunc('day', created_at)::date AS day,
                 COALESCE(SUM(actual_price) FILTER (WHERE status = 'completed'), 0) AS withdrawals
          FROM withdrawals
          WHERE created_at >= $1 AND created_at < $2
          GROUP BY 1
        `,
          [from, to],
        ),
        this.dataSource.query(
          `
          SELECT date_trunc('day', created_at)::date AS day, COUNT(*) AS new_users
          FROM users
          WHERE created_at >= $1 AND created_at < $2
          GROUP BY 1
        `,
          [from, to],
        ),
        this.dataSource.query(
          `
          SELECT day, SUM(rounds) AS rounds
          FROM (
            SELECT date_trunc('day', created_at)::date AS day,
                   COALESCE(SUM(total_drops), 0) AS rounds
            FROM case_history
            WHERE created_at >= $1 AND created_at < $2
            GROUP BY 1
            UNION ALL
            SELECT date_trunc('day', created_at)::date AS day, COUNT(*) AS rounds
            FROM upgrade_history
            WHERE created_at >= $1 AND created_at < $2
            GROUP BY 1
            UNION ALL
            SELECT date_trunc('day', created_at)::date AS day, COUNT(*) AS rounds
            FROM mines_sessions
            WHERE status <> 'active' AND created_at >= $1 AND created_at < $2
            GROUP BY 1
            UNION ALL
            SELECT date_trunc('day', created_at)::date AS day, COUNT(*) AS rounds
            FROM crash_sessions
            WHERE status <> 'active' AND created_at >= $1 AND created_at < $2
            GROUP BY 1
          ) games
          GROUP BY day
        `,
          [from, to],
        ),
      ],
    )

    for (const row of depositRows) {
      const item = days.get(this.dayKey(row.day))
      if (item) item.deposits = this.toMoney(row.deposits)
    }
    for (const row of withdrawalRows) {
      const item = days.get(this.dayKey(row.day))
      if (item) item.withdrawals = this.toMoney(row.withdrawals)
    }
    for (const row of userRows) {
      const item = days.get(this.dayKey(row.day))
      if (item) item.newUsers = this.toNumber(row.new_users)
    }
    for (const row of gameRows) {
      const item = days.get(this.dayKey(row.day))
      if (item) item.gameRounds = this.toNumber(row.rounds)
    }

    return [...days.values()].map(item => ({
      ...item,
      netCashflow: this.roundMoney(item.deposits - item.withdrawals),
    }))
  }

  private verticalSummary(
    key: GameVerticalSummary['key'],
    raw: Record<string, unknown> | undefined,
  ): GameVerticalSummary {
    const wagered = this.toMoney(raw?.wagered)
    const payout = this.toMoney(raw?.payout)
    const ggr = this.roundMoney(wagered - payout)

    return {
      activePlayers: this.toNumber(raw?.active_players),
      ggr,
      key,
      margin: wagered > 0 ? this.roundPercent((ggr / wagered) * 100) : 0,
      payout,
      rounds: this.toNumber(raw?.rounds),
      wagered,
    }
  }

  private combineVerticals(
    verticals: GameVerticalSummary[],
  ): GameVerticalSummary {
    const combined = verticals.reduce(
      (acc, item) => ({
        activePlayers: acc.activePlayers + item.activePlayers,
        ggr: acc.ggr + item.ggr,
        payout: acc.payout + item.payout,
        rounds: acc.rounds + item.rounds,
        wagered: acc.wagered + item.wagered,
      }),
      { activePlayers: 0, ggr: 0, payout: 0, rounds: 0, wagered: 0 },
    )

    return {
      ...combined,
      activePlayers: Math.max(...verticals.map(item => item.activePlayers), 0),
      ggr: this.roundMoney(combined.ggr),
      key: 'total',
      margin:
        combined.wagered > 0
          ? this.roundPercent((combined.ggr / combined.wagered) * 100)
          : 0,
      payout: this.roundMoney(combined.payout),
      wagered: this.roundMoney(combined.wagered),
    }
  }

  private amountSummary(count: unknown, amount: unknown): AmountSummary {
    return {
      amount: this.toMoney(amount),
      count: this.toNumber(count),
    }
  }

  private percentChange(currentValue: number, previousValue: number): number {
    if (previousValue === 0) return currentValue === 0 ? 0 : 100
    return this.roundPercent(
      ((currentValue - previousValue) / Math.abs(previousValue)) * 100,
    )
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date)
    result.setUTCDate(result.getUTCDate() + days)
    return result
  }

  private startOfUtcDay(date: Date): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    )
  }

  private dayKey(value: Date | string): string {
    if (value instanceof Date) return value.toISOString().slice(0, 10)
    return String(value).slice(0, 10)
  }

  private toNumber(value: unknown): number {
    const parsed = Number(value ?? 0)
    return Number.isFinite(parsed) ? parsed : 0
  }

  private toMoney(value: unknown): number {
    return this.roundMoney(this.toNumber(value))
  }

  private roundMoney(value: number): number {
    return Number(value.toFixed(2))
  }

  private roundPercent(value: number): number {
    return Number(value.toFixed(1))
  }
}
