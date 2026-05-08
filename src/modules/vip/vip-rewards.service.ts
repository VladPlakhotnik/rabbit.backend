import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, Repository } from 'typeorm'

import { User } from '../users/user.entity'
import { VipLedger } from './vip-ledger.entity'
import { VipRewardClaim } from './vip-reward-claim.entity'
import {
  VIP_REWARD_CASES,
  VipCaseCooldown,
  VipCaseLockedReason,
  VipCaseReward,
  VipRewardCaseConfig,
  VipRewardCaseType,
  VipTierConfig,
  calculateAvailableCashback,
  calculateVipCaseAvailability,
  calculateVipCaseExpectedValue,
  drawVipCaseReward,
  getVipCaseRewardTicketRanges,
  getVipCasePeriod,
  getVipRewardCaseBySlug,
  getVipTierForXp,
  getWeeklyVipPeriod,
} from './vip-rewards.logic'

export interface VipCaseSummary {
  type: VipRewardCaseType
  slug: string
  requiredTierId: string
  cooldown: VipCaseCooldown
  minTheoreticalRake: number
  periodTheoreticalRake: number
  missingTheoreticalRake: number
  expectedValue: number
  openedThisPeriod: boolean
  canOpen: boolean
  lockedReason: VipCaseLockedReason
  nextOpenAt: string | null
  period: {
    start: string
    end: string
    nextReset: string
  }
  rewards: readonly VipCaseReward[]
}

export interface VipRewardSummary {
  vipXp: number
  tier: VipTierConfig
  period: {
    start: string
    end: string
    nextReset: string
  }
  cashback: {
    rate: number
    cap: number
    periodTheoreticalRake: number
    claimed: number
    available: number
    canClaim: boolean
  }
  depositBoost: {
    rate: number
    cap: number
    minDeposit: number
    wageringMultiplier: number
    available: boolean
  }
  vipCases: VipCaseSummary[]
}

export interface RewardActionResult {
  success: true
  amount?: number
  caseType?: VipRewardCaseType
  vipCase?: VipCaseSummary
  summary: VipRewardSummary
}

interface PeriodClaimTotals {
  periodTheoreticalRake: number
  claimedCashback: number
}

const roundMoney = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100

const toNumber = (value: unknown): number => {
  const numberValue = typeof value === 'number' ? value : Number(value)

  return Number.isFinite(numberValue) ? numberValue : 0
}

@Injectable()
export class VipRewardsService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async getSummary(userId: number): Promise<VipRewardSummary> {
    const user = await this.users.findOne({ where: { id: userId } })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    return this.buildSummary(this.users.manager, user)
  }

  async getVipCase(userId: number, caseId: string): Promise<VipCaseSummary> {
    const user = await this.users.findOne({ where: { id: userId } })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    const tier = this.getUserTier(user)

    return this.buildVipCaseSummary(
      this.users.manager,
      user.id,
      tier,
      this.resolveVipCase(caseId),
    )
  }

  async claimCashback(userId: number): Promise<RewardActionResult> {
    return this.users.manager.transaction(async manager => {
      const user = await this.lockUser(manager, userId)
      const summary = await this.buildSummary(manager, user)

      if (!summary.cashback.canClaim) {
        throw new BadRequestException('No VIP cashback available')
      }

      user.balance = roundMoney(Number(user.balance) + summary.cashback.available)
      await manager.save(user)
      await this.saveClaim(manager, user.id, {
        rewardType: 'cashback',
        amount: summary.cashback.available,
        keyDelta: 0,
        periodStart: summary.period.start,
        periodEnd: summary.period.end,
        metadata: {
          tierId: summary.tier.id,
          cashbackRate: summary.cashback.rate,
          periodTheoreticalRake: summary.cashback.periodTheoreticalRake,
        },
      })

      return {
        success: true,
        amount: summary.cashback.available,
        summary: await this.buildSummary(manager, user),
      }
    })
  }

  async openVipCase(
    userId: number,
    caseId: string,
  ): Promise<RewardActionResult> {
    const caseConfig = this.resolveVipCase(caseId)

    return this.users.manager.transaction(async manager => {
      const user = await this.lockUser(manager, userId)
      const tier = this.getUserTier(user)
      const vipCase = await this.buildVipCaseSummary(
        manager,
        user.id,
        tier,
        caseConfig,
      )

      if (!vipCase.canOpen) {
        throw new BadRequestException(this.getVipCaseLockMessage(vipCase))
      }

      const reward = drawVipCaseReward(caseConfig.type)
      user.balance = roundMoney(Number(user.balance) + reward.amount)
      await manager.save(user)
      await this.saveClaim(manager, user.id, {
        rewardType: 'vip_case_open',
        amount: reward.amount,
        keyDelta: 0,
        periodStart: vipCase.period.start,
        periodEnd: vipCase.period.end,
        metadata: {
          tierId: tier.id,
          caseType: caseConfig.type,
          caseSlug: caseConfig.slug,
          cooldown: caseConfig.cooldown,
          minTheoreticalRake: caseConfig.minTheoreticalRake,
          periodTheoreticalRake: vipCase.periodTheoreticalRake,
          expectedValue: vipCase.expectedValue,
          ticket: reward.ticket,
          ticketRange: reward.ticketRange,
        },
      })

      const summary = await this.buildSummary(manager, user)
      const updatedVipCase = summary.vipCases.find(
        candidate => candidate.type === caseConfig.type,
      )

      return {
        success: true,
        amount: reward.amount,
        caseType: reward.caseType,
        vipCase: updatedVipCase,
        summary,
      }
    })
  }

  private resolveVipCase(caseId: string): VipRewardCaseConfig {
    const caseConfig = getVipRewardCaseBySlug(caseId)

    if (!caseConfig) {
      throw new BadRequestException('Unknown VIP case')
    }

    return caseConfig
  }

  private getUserTier(user: User): VipTierConfig {
    return getVipTierForXp(user.vip_xp ?? user.vip_qualifying_volume ?? 0)
  }

  private getVipCaseLockMessage(vipCase: VipCaseSummary): string {
    if (vipCase.lockedReason === 'tier') {
      return 'VIP tier is too low for this case'
    }

    if (vipCase.lockedReason === 'cooldown') {
      return 'VIP case is on cooldown'
    }

    if (vipCase.lockedReason === 'activity') {
      return 'Play more eligible games to unlock this VIP case'
    }

    return 'VIP case is not available'
  }

  private async lockUser(
    manager: EntityManager,
    userId: number,
  ): Promise<User> {
    const user = await manager.findOne(User, {
      where: { id: userId },
      lock: { mode: 'pessimistic_write' },
    })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    return user
  }

  private async buildSummary(
    manager: EntityManager,
    user: User,
    now = new Date(),
  ): Promise<VipRewardSummary> {
    const period = getWeeklyVipPeriod(now)
    const totals = await this.loadPeriodTotals(manager, user.id, period)
    const tier = this.getUserTier(user)
    const availableCashback = calculateAvailableCashback({
      tier,
      periodTheoreticalRake: totals.periodTheoreticalRake,
      claimedCashback: totals.claimedCashback,
    })
    const vipCases: VipCaseSummary[] = []

    for (const caseConfig of Object.values(VIP_REWARD_CASES)) {
      vipCases.push(
        await this.buildVipCaseSummary(manager, user.id, tier, caseConfig, now),
      )
    }

    return {
      vipXp: user.vip_xp ?? user.vip_qualifying_volume ?? 0,
      tier,
      period: {
        start: period.start.toISOString(),
        end: period.end.toISOString(),
        nextReset: period.end.toISOString(),
      },
      cashback: {
        rate: tier.cashbackRate,
        cap: tier.weeklyCashbackCap,
        periodTheoreticalRake: totals.periodTheoreticalRake,
        claimed: totals.claimedCashback,
        available: availableCashback,
        canClaim: availableCashback > 0,
      },
      depositBoost: {
        rate: tier.depositBonusRate,
        cap: tier.depositBonusCap,
        minDeposit: tier.depositMinAmount,
        wageringMultiplier: tier.depositWageringMultiplier,
        available: tier.depositBonusRate > 0,
      },
      vipCases,
    }
  }

  private async buildVipCaseSummary(
    manager: EntityManager,
    userId: number,
    tier: VipTierConfig,
    caseConfig: VipRewardCaseConfig,
    now = new Date(),
  ): Promise<VipCaseSummary> {
    const period = getVipCasePeriod(caseConfig.type, now)
    const periodTheoreticalRake = await this.loadPeriodTheoreticalRake(
      manager,
      userId,
      period,
    )
    const openedThisPeriod = await this.loadVipCaseOpenCount(
      manager,
      userId,
      caseConfig.type,
      period,
    )
    const availability = calculateVipCaseAvailability({
      tier,
      caseConfig,
      periodTheoreticalRake,
      openedThisPeriod,
      now,
    })

    return {
      type: caseConfig.type,
      slug: caseConfig.slug,
      requiredTierId: caseConfig.requiredTierId,
      cooldown: caseConfig.cooldown,
      minTheoreticalRake: caseConfig.minTheoreticalRake,
      periodTheoreticalRake,
      missingTheoreticalRake: availability.missingTheoreticalRake,
      expectedValue: calculateVipCaseExpectedValue(caseConfig),
      openedThisPeriod: openedThisPeriod > 0,
      canOpen: availability.canOpen,
      lockedReason: availability.lockedReason,
      nextOpenAt: availability.nextOpenAt,
      period: {
        start: availability.periodStart,
        end: availability.periodEnd,
        nextReset: availability.periodEnd,
      },
      rewards: getVipCaseRewardTicketRanges(caseConfig),
    }
  }

  private async loadPeriodTotals(
    manager: EntityManager,
    userId: number,
    period: { start: Date; end: Date },
  ): Promise<PeriodClaimTotals> {
    const periodTheoreticalRake = await this.loadPeriodTheoreticalRake(
      manager,
      userId,
      period,
    )
    const claimTotals = await manager
      .getRepository(VipRewardClaim)
      .createQueryBuilder('claim')
      .select(
        "COALESCE(SUM(CASE WHEN claim.reward_type = 'cashback' THEN claim.amount ELSE 0 END), 0)",
        'claimed_cashback',
      )
      .where('claim.user_id = :userId', { userId })
      .andWhere('claim.period_start = :start', { start: period.start })
      .andWhere('claim.period_end = :end', { end: period.end })
      .getRawOne<{
        claimed_cashback: string
      }>()

    return {
      periodTheoreticalRake,
      claimedCashback: roundMoney(toNumber(claimTotals?.claimed_cashback)),
    }
  }

  private async loadPeriodTheoreticalRake(
    manager: EntityManager,
    userId: number,
    period: { start: Date; end: Date },
  ): Promise<number> {
    const ledgerTotal = await manager
      .getRepository(VipLedger)
      .createQueryBuilder('ledger')
      .select('COALESCE(SUM(ledger.theoretical_rake), 0)', 'total')
      .where('ledger.user_id = :userId', { userId })
      .andWhere('ledger.created_at >= :start', { start: period.start })
      .andWhere('ledger.created_at < :end', { end: period.end })
      .getRawOne<{ total: string }>()

    return roundMoney(toNumber(ledgerTotal?.total))
  }

  private async loadVipCaseOpenCount(
    manager: EntityManager,
    userId: number,
    caseType: VipRewardCaseType,
    period: { start: Date; end: Date },
  ): Promise<number> {
    return manager
      .getRepository(VipRewardClaim)
      .createQueryBuilder('claim')
      .where('claim.user_id = :userId', { userId })
      .andWhere('claim.reward_type = :rewardType', {
        rewardType: 'vip_case_open',
      })
      .andWhere('claim.period_start = :start', { start: period.start })
      .andWhere('claim.period_end = :end', { end: period.end })
      .andWhere("claim.metadata ->> 'caseType' = :caseType", { caseType })
      .getCount()
  }

  private async saveClaim(
    manager: EntityManager,
    userId: number,
    input: {
      rewardType: VipRewardClaim['reward_type']
      amount: number
      keyDelta: number
      periodStart: string | Date
      periodEnd: string | Date
      metadata: Record<string, unknown>
    },
  ): Promise<void> {
    const claim = manager.create(VipRewardClaim, {
      user_id: userId,
      reward_type: input.rewardType,
      amount: input.amount,
      key_delta: input.keyDelta,
      period_start: new Date(input.periodStart),
      period_end: new Date(input.periodEnd),
      metadata: input.metadata,
    })

    await manager.save(VipRewardClaim, claim)
  }
}
