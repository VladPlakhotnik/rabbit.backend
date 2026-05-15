import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'

import {
  buildPaginatedResponse,
  normalizePagination,
  type PaginatedResponse,
} from '../../common/pagination'
import { User } from '../users/user.entity'
import type { VipLedgerSourceType } from './vip-earning.logic'
import { buildAdminVipCaseConfigs, countVipUsersByTier } from './vip-admin.logic'
import { VipLedger } from './vip-ledger.entity'
import { VipRewardClaim } from './vip-reward-claim.entity'
import type { VipRewardClaimType } from './vip-reward-claim.entity'
import {
  VIP_TIERS,
  VipRewardCaseType,
  VipTierId,
  getVipTierForXp,
  getWeeklyVipPeriod,
} from './vip-rewards.logic'
import type {
  AdminVipClaimsQueryDto,
  AdminVipLedgerQueryDto,
} from './dto/admin-vip.dto'

interface AdminVipUserSummary {
  avatar: string | null
  display_name: string
  id: number
}

interface AdminVipTopUser extends AdminVipUserSummary {
  tierId: VipTierId
  vip_qualifying_volume: number
  vip_theoretical_rake: number
  vip_xp: number
}

interface AdminVipTierOverview {
  cashbackRate: number
  depositBonusCap: number
  depositBonusRate: number
  id: VipTierId
  managerLevel: string
  depositMinAmount: number
  threshold: number
  userCount: number
  depositWageringMultiplier: number
  weeklyCashbackCap: number
}

interface AdminVipCaseOverview {
  cooldown: string
  expectedValue: number
  maxReward: number
  minReward: number
  minTheoreticalRake: number
  openedThisPeriod: number
  openedTotal: number
  paidThisPeriod: number
  paidTotal: number
  requiredTierId: VipTierId
  rewardCount: number
  slug: string
  type: VipRewardCaseType
}

interface AdminVipOverview {
  cases: AdminVipCaseOverview[]
  metrics: {
    activeVipUsers: number
    cashbackPaid: number
    totalLedgerEntries: number
    totalRewardsPaid: number
    totalTheoreticalRake: number
    totalUsers: number
    totalVipCaseOpens: number
    totalVipXp: number
    totalWagered: number
    vipCaseRewardsPaid: number
    weeklyRewardsPaid: number
    weeklyTheoreticalRake: number
    weeklyVipCaseOpens: number
    weeklyVipXp: number
    weeklyWagered: number
  }
  period: {
    end: Date
    start: Date
  }
  tiers: AdminVipTierOverview[]
  topUsers: AdminVipTopUser[]
}

interface AdminVipLedgerItem {
  created_at: Date
  house_edge_bps: number
  id: string
  metadata: Record<string, unknown>
  product_xp_rate_bps: number
  source_id: string | null
  source_type: VipLedgerSourceType
  theoretical_rake: number
  user: AdminVipUserSummary
  user_id: number
  vip_xp: number
  wager_amount: number
}

interface AdminVipClaimItem {
  amount: number
  created_at: Date
  id: string
  key_delta: number
  metadata: Record<string, unknown>
  period_end: Date
  period_start: Date
  reward_type: VipRewardClaimType
  user: AdminVipUserSummary
  user_id: number
}

const roundMoney = (value: number): number =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100

const toNumber = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0)

  return Number.isFinite(parsed) ? parsed : 0
}

const toUserSummary = (user: User | undefined, userId: number): AdminVipUserSummary => ({
  avatar: user?.avatar ?? null,
  display_name: user?.display_name ?? `User #${userId}`,
  id: user?.id ?? userId,
})

@Injectable()
export class AdminVipService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(VipLedger)
    private readonly ledger: Repository<VipLedger>,
    @InjectRepository(VipRewardClaim)
    private readonly claims: Repository<VipRewardClaim>,
    private readonly dataSource: DataSource,
  ) {}

  async getOverview(): Promise<AdminVipOverview> {
    const period = getWeeklyVipPeriod(new Date())
    const [
      userRows,
      topUserRows,
      ledgerRows,
      claimRows,
      caseRows,
    ] = await Promise.all([
      this.users
        .createQueryBuilder('user')
        .select('user.vip_xp', 'vip_xp')
        .addSelect('user.vip_qualifying_volume', 'vip_qualifying_volume')
        .getRawMany<{ vip_qualifying_volume: string | number; vip_xp: string | number }>(),
      this.users
        .createQueryBuilder('user')
        .select('user.id', 'id')
        .addSelect('user.display_name', 'display_name')
        .addSelect('user.avatar', 'avatar')
        .addSelect('user.vip_xp', 'vip_xp')
        .addSelect('user.vip_qualifying_volume', 'vip_qualifying_volume')
        .addSelect('user.vip_theoretical_rake', 'vip_theoretical_rake')
        .orderBy('user.vip_xp', 'DESC')
        .addOrderBy('user.vip_theoretical_rake', 'DESC')
        .take(8)
        .getRawMany<{
          avatar: string | null
          display_name: string
          id: string | number
          vip_qualifying_volume: string | number
          vip_theoretical_rake: string | number
          vip_xp: string | number
        }>(),
      this.dataSource.query(
        `
          SELECT
            COUNT(*)::int AS total_ledger_entries,
            COALESCE(SUM("wager_amount"), 0)::numeric AS total_wagered,
            COALESCE(SUM("theoretical_rake"), 0)::numeric AS total_theoretical_rake,
            COALESCE(SUM("vip_xp"), 0)::numeric AS total_vip_xp,
            COALESCE(SUM(CASE WHEN "created_at" >= $1 AND "created_at" < $2 THEN "wager_amount" ELSE 0 END), 0)::numeric AS weekly_wagered,
            COALESCE(SUM(CASE WHEN "created_at" >= $1 AND "created_at" < $2 THEN "theoretical_rake" ELSE 0 END), 0)::numeric AS weekly_theoretical_rake,
            COALESCE(SUM(CASE WHEN "created_at" >= $1 AND "created_at" < $2 THEN "vip_xp" ELSE 0 END), 0)::numeric AS weekly_vip_xp
          FROM "vip_ledger"
        `,
        [period.start, period.end],
      ),
      this.dataSource.query(
        `
          SELECT
            COALESCE(SUM("amount"), 0)::numeric AS total_rewards_paid,
            COALESCE(SUM("amount") FILTER (WHERE "reward_type" = 'cashback'), 0)::numeric AS cashback_paid,
            COALESCE(SUM("amount") FILTER (WHERE "reward_type" = 'vip_case_open'), 0)::numeric AS vip_case_rewards_paid,
            COUNT(*) FILTER (WHERE "reward_type" = 'vip_case_open')::int AS total_vip_case_opens,
            COALESCE(SUM(CASE WHEN "created_at" >= $1 AND "created_at" < $2 THEN "amount" ELSE 0 END), 0)::numeric AS weekly_rewards_paid,
            COUNT(*) FILTER (
              WHERE "reward_type" = 'vip_case_open'
                AND "created_at" >= $1
                AND "created_at" < $2
            )::int AS weekly_vip_case_opens
          FROM "vip_reward_claims"
        `,
        [period.start, period.end],
      ),
      this.dataSource.query(
        `
          SELECT
            COALESCE("metadata" ->> 'caseType', 'unknown') AS case_type,
            COUNT(*)::int AS opened_total,
            COALESCE(SUM("amount"), 0)::numeric AS paid_total,
            COUNT(*) FILTER (WHERE "created_at" >= $1 AND "created_at" < $2)::int AS opened_this_period,
            COALESCE(SUM(CASE WHEN "created_at" >= $1 AND "created_at" < $2 THEN "amount" ELSE 0 END), 0)::numeric AS paid_this_period
          FROM "vip_reward_claims"
          WHERE "reward_type" = 'vip_case_open'
          GROUP BY 1
        `,
        [period.start, period.end],
      ),
    ])

    const tierCounts = countVipUsersByTier(userRows)
    const ledgerMetrics = ledgerRows[0] ?? {}
    const claimMetrics = claimRows[0] ?? {}
    const caseStats = new Map<
      string,
      {
        openedThisPeriod: number
        openedTotal: number
        paidThisPeriod: number
        paidTotal: number
      }
    >(
      caseRows.map((row: Record<string, unknown>) => [
        String(row.case_type ?? 'unknown'),
        {
          openedThisPeriod: toNumber(row.opened_this_period),
          openedTotal: toNumber(row.opened_total),
          paidThisPeriod: roundMoney(toNumber(row.paid_this_period)),
          paidTotal: roundMoney(toNumber(row.paid_total)),
        },
      ]),
    )

    return {
      cases: buildAdminVipCaseConfigs().map(config => {
        const stats = caseStats.get(config.type) ?? {
          openedThisPeriod: 0,
          openedTotal: 0,
          paidThisPeriod: 0,
          paidTotal: 0,
        }

        return {
          cooldown: config.cooldown,
          expectedValue: config.expectedValue,
          maxReward: config.maxReward,
          minReward: config.minReward,
          minTheoreticalRake: config.minTheoreticalRake,
          openedThisPeriod: stats.openedThisPeriod,
          openedTotal: stats.openedTotal,
          paidThisPeriod: stats.paidThisPeriod,
          paidTotal: stats.paidTotal,
          requiredTierId: config.requiredTierId,
          rewardCount: config.rewardCount,
          slug: config.slug,
          type: config.type,
        }
      }),
      metrics: {
        activeVipUsers: userRows.filter(row => toNumber(row.vip_xp) > 0).length,
        cashbackPaid: roundMoney(toNumber(claimMetrics.cashback_paid)),
        totalLedgerEntries: toNumber(ledgerMetrics.total_ledger_entries),
        totalRewardsPaid: roundMoney(toNumber(claimMetrics.total_rewards_paid)),
        totalTheoreticalRake: roundMoney(
          toNumber(ledgerMetrics.total_theoretical_rake),
        ),
        totalUsers: userRows.length,
        totalVipCaseOpens: toNumber(claimMetrics.total_vip_case_opens),
        totalVipXp: roundMoney(toNumber(ledgerMetrics.total_vip_xp)),
        totalWagered: roundMoney(toNumber(ledgerMetrics.total_wagered)),
        vipCaseRewardsPaid: roundMoney(
          toNumber(claimMetrics.vip_case_rewards_paid),
        ),
        weeklyRewardsPaid: roundMoney(toNumber(claimMetrics.weekly_rewards_paid)),
        weeklyTheoreticalRake: roundMoney(
          toNumber(ledgerMetrics.weekly_theoretical_rake),
        ),
        weeklyVipCaseOpens: toNumber(claimMetrics.weekly_vip_case_opens),
        weeklyVipXp: roundMoney(toNumber(ledgerMetrics.weekly_vip_xp)),
        weeklyWagered: roundMoney(toNumber(ledgerMetrics.weekly_wagered)),
      },
      period,
      tiers: VIP_TIERS.map(tier => ({
        cashbackRate: tier.cashbackRate,
        depositBonusCap: tier.depositBonusCap,
        depositBonusRate: tier.depositBonusRate,
        id: tier.id,
        depositMinAmount: tier.depositMinAmount,
        threshold: tier.threshold,
        userCount: tierCounts[tier.id],
        depositWageringMultiplier: tier.depositWageringMultiplier,
        managerLevel: tier.managerLevel,
        weeklyCashbackCap: tier.weeklyCashbackCap,
      })),
      topUsers: topUserRows.map(row => {
        const vipXp = toNumber(row.vip_xp)

        return {
          avatar: row.avatar,
          display_name: row.display_name,
          id: toNumber(row.id),
          tierId: getVipTierForXp(vipXp).id,
          vip_qualifying_volume: roundMoney(toNumber(row.vip_qualifying_volume)),
          vip_theoretical_rake: roundMoney(toNumber(row.vip_theoretical_rake)),
          vip_xp: roundMoney(vipXp),
        }
      }),
    }
  }

  async listLedger(
    query: AdminVipLedgerQueryDto = {},
  ): Promise<PaginatedResponse<AdminVipLedgerItem>> {
    const pagination = normalizePagination(query)
    const qb = this.ledger
      .createQueryBuilder('entry')
      .leftJoin('entry.user', 'user')
      .addSelect(['user.id', 'user.display_name', 'user.avatar'])

    if (query.userId !== undefined) {
      qb.andWhere('entry.user_id = :userId', { userId: query.userId })
    }

    if (query.sourceType) {
      qb.andWhere('entry.source_type = :sourceType', {
        sourceType: query.sourceType,
      })
    }

    const search = query.search?.trim()
    if (search) {
      qb.andWhere(
        [
          '(',
          'CAST(entry.id AS TEXT) ILIKE :search',
          'OR CAST(entry.user_id AS TEXT) ILIKE :search',
          'OR COALESCE(entry.source_id, \'\') ILIKE :search',
          'OR COALESCE(user.display_name, \'\') ILIKE :search',
          ')',
        ].join(' '),
        { search: `%${search}%` },
      )
    }

    qb.orderBy('entry.created_at', 'DESC')
      .skip(pagination.skip)
      .take(pagination.limit)

    const [items, total] = await qb.getManyAndCount()

    return buildPaginatedResponse(
      items.map(entry => this.toLedgerItem(entry)),
      total,
      pagination,
    )
  }

  async listClaims(
    query: AdminVipClaimsQueryDto = {},
  ): Promise<PaginatedResponse<AdminVipClaimItem>> {
    const pagination = normalizePagination(query)
    const qb = this.claims
      .createQueryBuilder('claim')
      .leftJoin('claim.user', 'user')
      .addSelect(['user.id', 'user.display_name', 'user.avatar'])

    if (query.userId !== undefined) {
      qb.andWhere('claim.user_id = :userId', { userId: query.userId })
    }

    if (query.rewardType) {
      qb.andWhere('claim.reward_type = :rewardType', {
        rewardType: query.rewardType,
      })
    }

    const search = query.search?.trim()
    if (search) {
      qb.andWhere(
        [
          '(',
          'CAST(claim.id AS TEXT) ILIKE :search',
          'OR CAST(claim.user_id AS TEXT) ILIKE :search',
          'OR claim.reward_type ILIKE :search',
          'OR COALESCE(user.display_name, \'\') ILIKE :search',
          ')',
        ].join(' '),
        { search: `%${search}%` },
      )
    }

    qb.orderBy('claim.created_at', 'DESC')
      .skip(pagination.skip)
      .take(pagination.limit)

    const [items, total] = await qb.getManyAndCount()

    return buildPaginatedResponse(
      items.map(claim => this.toClaimItem(claim)),
      total,
      pagination,
    )
  }

  private toLedgerItem(entry: VipLedger): AdminVipLedgerItem {
    return {
      created_at: entry.created_at,
      house_edge_bps: entry.house_edge_bps,
      id: entry.id,
      metadata: entry.metadata ?? {},
      product_xp_rate_bps: entry.product_xp_rate_bps,
      source_id: entry.source_id,
      source_type: entry.source_type,
      theoretical_rake: roundMoney(toNumber(entry.theoretical_rake)),
      user: toUserSummary(entry.user, entry.user_id),
      user_id: entry.user_id,
      vip_xp: roundMoney(toNumber(entry.vip_xp)),
      wager_amount: roundMoney(toNumber(entry.wager_amount)),
    }
  }

  private toClaimItem(claim: VipRewardClaim): AdminVipClaimItem {
    return {
      amount: roundMoney(toNumber(claim.amount)),
      created_at: claim.created_at,
      id: claim.id,
      key_delta: claim.key_delta,
      metadata: claim.metadata ?? {},
      period_end: claim.period_end,
      period_start: claim.period_start,
      reward_type: claim.reward_type,
      user: toUserSummary(claim.user, claim.user_id),
      user_id: claim.user_id,
    }
  }
}
