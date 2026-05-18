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

interface RegistrationTrendPoint {
  date: string
  newUsers: number
}

interface AnalyticsCountrySummary {
  code: string
  name: string
  percentage: number
  users: number
}

interface AnalyticsFinancePeriodSummary {
  deposits: AmountSummary
  netCashflow: number
  pendingDeposits: AmountSummary
  withdrawals: AmountSummary
}

interface AnalyticsGamePeriodSummary {
  byVertical: GameVerticalSummary[]
  total: GameVerticalSummary
}

interface AnalyticsNamedPeriod<T> {
  from: string
  key: 'today' | 'week' | 'month'
  label: string
  to: string
  value: T
}

const PERIOD_DAYS = 30
const TREND_DAYS = 14
const DASHBOARD_TREND_DAYS = 7
const COUNTRY_NAMES: Record<string, string> = {
  AE: 'United Arab Emirates',
  AU: 'Australia',
  BR: 'Brazil',
  CA: 'Canada',
  CN: 'China',
  DE: 'Germany',
  ES: 'Spain',
  FR: 'France',
  GB: 'United Kingdom',
  IN: 'India',
  JP: 'Japan',
  KZ: 'Kazakhstan',
  NL: 'Netherlands',
  PL: 'Poland',
  RU: 'Russia',
  TR: 'Turkey',
  UA: 'Ukraine',
  US: 'United States',
}

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

  async getSummary(timezone = 'UTC') {
    const safeTimezone = this.normalizeTimezone(timezone)
    const now = new Date()
    const todayFrom = await this.getTimezoneDayStart(safeTimezone)
    const weekFrom = this.addDays(now, -7)
    const monthFrom = this.addDays(now, -30)
    const registrationTrendFrom = this.startOfUtcDay(
      this.addDays(now, -(DASHBOARD_TREND_DAYS - 1)),
    )

    const [
      todayUsers,
      weekUsers,
      monthUsers,
      todayFinance,
      weekFinance,
      monthFinance,
      todayGames,
      weekGames,
      monthGames,
      registrationTrend,
      onlineUsers,
    ] = await Promise.all([
      this.getUserSummary(todayFrom, now),
      this.getUserSummary(weekFrom, now),
      this.getUserSummary(monthFrom, now),
      this.getFinancePeriodSummary(todayFrom, now),
      this.getFinancePeriodSummary(weekFrom, now),
      this.getFinancePeriodSummary(monthFrom, now),
      this.getGamePeriodSummary(todayFrom, now),
      this.getGamePeriodSummary(weekFrom, now),
      this.getGamePeriodSummary(monthFrom, now),
      this.getRegistrationTrend(registrationTrendFrom, now),
      this.presenceService.getOnlineCount(),
    ])

    const countries = await this.getCountrySummary(todayUsers.totalUsers)

    return {
      generated_at: now.toISOString(),
      timezone: safeTimezone,
      totals: {
        online: onlineUsers,
        totalBalance: todayUsers.totalBalance,
        totalUsers: todayUsers.totalUsers,
      },
      registrations: {
        month: monthUsers.newUsers,
        today: todayUsers.newUsers,
        total: todayUsers.totalUsers,
        trend: registrationTrend,
        week: weekUsers.newUsers,
      },
      finance: {
        month: this.namedPeriod('month', monthFrom, now, monthFinance),
        today: this.namedPeriod('today', todayFrom, now, todayFinance),
        week: this.namedPeriod('week', weekFrom, now, weekFinance),
      },
      games: {
        month: this.namedPeriod('month', monthFrom, now, monthGames),
        today: this.namedPeriod('today', todayFrom, now, todayGames),
        week: this.namedPeriod('week', weekFrom, now, weekGames),
      },
      geography: countries,
    }
  }

  private async getDepositSummary(
    from: Date,
    to: Date,
  ): Promise<DepositSummary> {
    const [raw] = await this.dataSource.query(
      `
        SELECT
          COUNT(*) FILTER (WHERE created_at >= $1 AND created_at < $2) AS total_count,
          COALESCE(SUM(amount) FILTER (WHERE created_at >= $1 AND created_at < $2), 0) AS total_amount,
          COUNT(*) FILTER (
            WHERE status = 'success'
              AND COALESCE(credited_at, created_at) >= $1
              AND COALESCE(credited_at, created_at) < $2
          ) AS success_count,
          COALESCE(SUM(amount) FILTER (
            WHERE status = 'success'
              AND COALESCE(credited_at, created_at) >= $1
              AND COALESCE(credited_at, created_at) < $2
          ), 0) AS success_amount,
          COUNT(DISTINCT user_id) FILTER (
            WHERE status = 'success'
              AND COALESCE(credited_at, created_at) >= $1
              AND COALESCE(credited_at, created_at) < $2
          ) AS active_depositors,
          COUNT(*) FILTER (WHERE status = 'waiting' AND created_at >= $1 AND created_at < $2) AS waiting_count,
          COALESCE(SUM(amount) FILTER (WHERE status = 'waiting' AND created_at >= $1 AND created_at < $2), 0) AS waiting_amount,
          COUNT(*) FILTER (WHERE status = 'error' AND created_at >= $1 AND created_at < $2) AS error_count,
          COALESCE(SUM(amount) FILTER (WHERE status = 'error' AND created_at >= $1 AND created_at < $2), 0) AS error_amount,
          COUNT(*) FILTER (WHERE status = 'cancelled' AND created_at >= $1 AND created_at < $2) AS cancelled_count,
          COALESCE(SUM(amount) FILTER (WHERE status = 'cancelled' AND created_at >= $1 AND created_at < $2), 0) AS cancelled_amount
        FROM user_deposits
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
          SELECT user_id
          FROM user_deposits
          WHERE created_at >= $1 AND created_at < $2
             OR (
               status = 'success'
               AND COALESCE(credited_at, created_at) >= $1
               AND COALESCE(credited_at, created_at) < $2
             )
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
          SELECT date_trunc('day', COALESCE(credited_at, created_at))::date AS day,
                 COALESCE(SUM(amount), 0) AS deposits
          FROM user_deposits
          WHERE status = 'success'
            AND COALESCE(credited_at, created_at) >= $1
            AND COALESCE(credited_at, created_at) < $2
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

  private async getRegistrationTrend(
    from: Date,
    to: Date,
  ): Promise<RegistrationTrendPoint[]> {
    const days = new Map<string, RegistrationTrendPoint>()

    for (let day = new Date(from); day <= to; day = this.addDays(day, 1)) {
      const key = day.toISOString().slice(0, 10)
      days.set(key, { date: key, newUsers: 0 })
    }

    const rows = await this.dataSource.query(
      `
        SELECT date_trunc('day', created_at)::date AS day, COUNT(*) AS new_users
        FROM users
        WHERE created_at >= $1 AND created_at < $2
        GROUP BY 1
      `,
      [from, to],
    )

    for (const row of rows) {
      const item = days.get(this.dayKey(row.day))
      if (item) item.newUsers = this.toNumber(row.new_users)
    }

    return [...days.values()]
  }

  private async getFinancePeriodSummary(
    from: Date,
    to: Date,
  ): Promise<AnalyticsFinancePeriodSummary> {
    const [deposits, withdrawals] = await Promise.all([
      this.getDepositSummary(from, to),
      this.getWithdrawalSummary(from, to),
    ])

    return {
      deposits: deposits.success,
      netCashflow: this.roundMoney(deposits.success.amount - withdrawals.actualAmount),
      pendingDeposits: deposits.waiting,
      withdrawals: {
        amount: withdrawals.actualAmount,
        count: withdrawals.completed,
      },
    }
  }

  private async getGamePeriodSummary(
    from: Date,
    to: Date,
  ): Promise<AnalyticsGamePeriodSummary> {
    const byVertical = await Promise.all([
      this.getCasesSummary(from, to),
      this.getUpgradeSummary(from, to),
      this.getMinesSummary(from, to),
      this.getCrashSummary(from, to),
    ])

    return {
      byVertical,
      total: this.combineVerticals(byVertical),
    }
  }

  private async getCountrySummary(totalUsers: number): Promise<{
    countries: AnalyticsCountrySummary[]
    hasCountryData: boolean
  }> {
    const countryColumn = await this.getUserCountryColumn()

    if (!countryColumn) {
      return {
        countries: [
          {
            code: 'unknown',
            name: 'Unknown',
            percentage: totalUsers > 0 ? 100 : 0,
            users: totalUsers,
          },
        ],
        hasCountryData: false,
      }
    }

    const rows = await this.dataSource.query(
      `
        SELECT COALESCE(NULLIF(UPPER(${countryColumn}), ''), 'unknown') AS code, COUNT(*) AS users
        FROM users
        GROUP BY 1
        ORDER BY users DESC
        LIMIT 12
      `,
    )

    const countries: AnalyticsCountrySummary[] = rows.map(
      (row: Record<string, unknown>) => {
        const users = this.toNumber(row.users)
        const code = String(row.code ?? 'unknown')
        return {
          code,
          name: this.getCountryName(code),
          percentage:
            totalUsers > 0 ? this.roundPercent((users / totalUsers) * 100) : 0,
          users,
        }
      },
    )

    return {
      countries,
      hasCountryData: countries.some(country => country.code !== 'unknown'),
    }
  }

  private getCountryName(code: string): string {
    if (code === 'unknown') return 'Unknown'
    return COUNTRY_NAMES[code] ?? code
  }

  private async getUserCountryColumn(): Promise<string | null> {
    const rows = await this.dataSource.query(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'users'
          AND column_name IN ('country_code', 'country', 'geo_country')
        ORDER BY CASE column_name
          WHEN 'country_code' THEN 1
          WHEN 'country' THEN 2
          ELSE 3
        END
        LIMIT 1
      `,
    )
    const column = rows[0]?.column_name
    if (column === 'country_code' || column === 'country' || column === 'geo_country') {
      return `"${column}"`
    }
    return null
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

  private namedPeriod<T>(
    key: AnalyticsNamedPeriod<T>['key'],
    from: Date,
    to: Date,
    value: T,
  ): AnalyticsNamedPeriod<T> {
    return {
      from: from.toISOString(),
      key,
      label: key,
      to: to.toISOString(),
      value,
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

  private async getTimezoneDayStart(timezone: string): Promise<Date> {
    try {
      const [row] = await this.dataSource.query(
        `
          SELECT (date_trunc('day', now() AT TIME ZONE $1) AT TIME ZONE $1) AS day_start
        `,
        [timezone],
      )
      const value = row?.day_start
      const date = value instanceof Date ? value : new Date(value)
      return Number.isNaN(date.getTime()) ? this.startOfUtcDay(new Date()) : date
    } catch {
      return this.startOfUtcDay(new Date())
    }
  }

  private normalizeTimezone(timezone: string): string {
    try {
      new Intl.DateTimeFormat('en', { timeZone: timezone }).format(new Date())
      return timezone
    } catch {
      return 'UTC'
    }
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
