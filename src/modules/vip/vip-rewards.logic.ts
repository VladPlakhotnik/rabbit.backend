export type VipTierId = 'bronze' | 'gold' | 'diamond' | 'black'

export type VipRewardCaseType = 'daily' | 'gold' | 'diamond' | 'black'
export type VipCaseCooldown = 'daily' | 'weekly' | 'monthly'
export type VipCaseLockedReason = 'tier' | 'activity' | 'cooldown' | null

export interface VipTierConfig {
  id: VipTierId
  threshold: number
  cashbackRate: number
  weeklyCashbackCap: number
  depositBonusRate: number
  depositBonusCap: number
  depositMinAmount: number
  depositWageringMultiplier: number
  managerLevel: 'community' | 'standard' | 'priority' | 'personal'
}

interface CashbackInput {
  tier: VipTierConfig
  periodTheoreticalRake: number
  claimedCashback: number
}

export interface WeightedReward {
  amount: number
  weight: number
}

export interface VipCaseTicketRange {
  min: number
  max: number
}

export interface VipCaseReward extends WeightedReward {
  ticketRange: VipCaseTicketRange
}

export interface VipRewardCaseConfig {
  type: VipRewardCaseType
  slug: string
  requiredTierId: VipTierId
  cooldown: VipCaseCooldown
  minTheoreticalRake: number
  rewards: readonly WeightedReward[]
}

interface VipCaseAvailabilityInput {
  tier: VipTierConfig
  caseConfig: VipRewardCaseConfig
  periodTheoreticalRake: number
  openedThisPeriod: number
  now?: Date
}

interface VipCaseAvailability {
  canOpen: boolean
  lockedReason: VipCaseLockedReason
  missingTheoreticalRake: number
  nextOpenAt: string | null
  periodStart: string
  periodEnd: string
}

export const VIP_TIERS: readonly VipTierConfig[] = [
  {
    id: 'bronze',
    threshold: 0,
    cashbackRate: 1,
    weeklyCashbackCap: 5,
    depositBonusRate: 3,
    depositBonusCap: 10,
    depositMinAmount: 10,
    depositWageringMultiplier: 8,
    managerLevel: 'community',
  },
  {
    id: 'gold',
    threshold: 500,
    cashbackRate: 3.5,
    weeklyCashbackCap: 50,
    depositBonusRate: 7,
    depositBonusCap: 35,
    depositMinAmount: 20,
    depositWageringMultiplier: 10,
    managerLevel: 'priority',
  },
  {
    id: 'diamond',
    threshold: 5000,
    cashbackRate: 7,
    weeklyCashbackCap: 250,
    depositBonusRate: 12,
    depositBonusCap: 125,
    depositMinAmount: 50,
    depositWageringMultiplier: 12,
    managerLevel: 'personal',
  },
  {
    id: 'black',
    threshold: 15000,
    cashbackRate: 10,
    weeklyCashbackCap: 500,
    depositBonusRate: 15,
    depositBonusCap: 250,
    depositMinAmount: 100,
    depositWageringMultiplier: 15,
    managerLevel: 'personal',
  },
] as const

export const VIP_REWARD_CASES: Record<VipRewardCaseType, VipRewardCaseConfig> =
  {
    daily: {
      type: 'daily',
      slug: 'daily-spark',
      requiredTierId: 'bronze',
      cooldown: 'daily',
      minTheoreticalRake: 0.5,
      rewards: [
        { amount: 0.02, weight: 2200 },
        { amount: 0.03, weight: 2200 },
        { amount: 0.05, weight: 1800 },
        { amount: 0.08, weight: 1400 },
        { amount: 0.1, weight: 1000 },
        { amount: 0.15, weight: 700 },
        { amount: 0.25, weight: 400 },
        { amount: 0.5, weight: 200 },
        { amount: 1, weight: 80 },
        { amount: 2, weight: 20 },
      ],
    },
    gold: {
      type: 'gold',
      slug: 'vip-gold',
      requiredTierId: 'gold',
      cooldown: 'weekly',
      minTheoreticalRake: 15,
      rewards: [
        { amount: 0.25, weight: 2000 },
        { amount: 0.5, weight: 2500 },
        { amount: 0.75, weight: 1800 },
        { amount: 1, weight: 1500 },
        { amount: 1.5, weight: 1000 },
        { amount: 2.5, weight: 600 },
        { amount: 5, weight: 350 },
        { amount: 10, weight: 180 },
        { amount: 25, weight: 60 },
        { amount: 50, weight: 10 },
      ],
    },
    diamond: {
      type: 'diamond',
      slug: 'vip-diamond',
      requiredTierId: 'diamond',
      cooldown: 'weekly',
      minTheoreticalRake: 60,
      rewards: [
        { amount: 1, weight: 2000 },
        { amount: 2, weight: 2500 },
        { amount: 3, weight: 1800 },
        { amount: 5, weight: 1500 },
        { amount: 7.5, weight: 1000 },
        { amount: 10, weight: 600 },
        { amount: 25, weight: 350 },
        { amount: 50, weight: 180 },
        { amount: 100, weight: 60 },
        { amount: 250, weight: 10 },
      ],
    },
    black: {
      type: 'black',
      slug: 'vip-black',
      requiredTierId: 'black',
      cooldown: 'monthly',
      minTheoreticalRake: 150,
      rewards: [
        { amount: 2, weight: 2000 },
        { amount: 5, weight: 2500 },
        { amount: 7.5, weight: 1800 },
        { amount: 10, weight: 1500 },
        { amount: 15, weight: 1000 },
        { amount: 25, weight: 600 },
        { amount: 50, weight: 350 },
        { amount: 100, weight: 180 },
        { amount: 250, weight: 60 },
        { amount: 500, weight: 10 },
      ],
    },
  }

const roundMoney = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100

const normalizePositiveNumber = (value: number): number =>
  Number.isFinite(value) && value > 0 ? value : 0

export const getVipTierForXp = (vipXp: number): VipTierConfig => {
  const normalizedVipXp = normalizePositiveNumber(vipXp)

  return VIP_TIERS.reduce(
    (currentTier, tier) =>
      normalizedVipXp >= tier.threshold ? tier : currentTier,
    VIP_TIERS[0],
  )
}

export const getWeeklyVipPeriod = (
  now = new Date(),
): {
  start: Date
  end: Date
} => {
  const start = new Date(now)
  start.setUTCHours(0, 0, 0, 0)

  const day = start.getUTCDay()
  const daysSinceMonday = (day + 6) % 7
  start.setUTCDate(start.getUTCDate() - daysSinceMonday)

  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 7)

  return { start, end }
}

export const getVipCasePeriod = (
  caseType: VipRewardCaseType,
  now = new Date(),
): {
  start: Date
  end: Date
} => {
  const caseConfig = VIP_REWARD_CASES[caseType]

  if (caseConfig.cooldown === 'weekly') {
    return getWeeklyVipPeriod(now)
  }

  if (caseConfig.cooldown === 'monthly') {
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
    )
    const end = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0),
    )

    return { start, end }
  }

  const start = new Date(now)
  start.setUTCHours(0, 0, 0, 0)

  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 1)

  return { start, end }
}

export const calculateAvailableCashback = ({
  tier,
  periodTheoreticalRake,
  claimedCashback,
}: CashbackInput): number => {
  const grossCashback = roundMoney(
    normalizePositiveNumber(periodTheoreticalRake) * (tier.cashbackRate / 100),
  )
  const cappedCashback = Math.min(grossCashback, tier.weeklyCashbackCap)

  return roundMoney(
    Math.max(0, cappedCashback - normalizePositiveNumber(claimedCashback)),
  )
}

export const tierMeetsRequirement = (
  tier: VipTierConfig,
  requiredTierId: VipTierId,
): boolean => {
  const tierIndex = VIP_TIERS.findIndex(candidate => candidate.id === tier.id)
  const requiredIndex = VIP_TIERS.findIndex(
    candidate => candidate.id === requiredTierId,
  )

  return tierIndex >= requiredIndex
}

export const getVipRewardCaseBySlug = (
  slugOrType: string,
): VipRewardCaseConfig | null =>
  Object.values(VIP_REWARD_CASES).find(
    caseConfig =>
      caseConfig.slug === slugOrType || caseConfig.type === slugOrType,
  ) ?? null

export const calculateVipCaseExpectedValue = (
  caseConfig: VipRewardCaseConfig,
): number => {
  const totalWeight = caseConfig.rewards.reduce(
    (total, reward) => total + reward.weight,
    0,
  )

  if (totalWeight <= 0) {
    return 0
  }

  return roundMoney(
    caseConfig.rewards.reduce(
      (total, reward) => total + reward.amount * reward.weight,
      0,
    ) / totalWeight,
  )
}

export const getVipCaseRewardTicketRanges = (
  caseConfig: VipRewardCaseConfig,
): VipCaseReward[] => {
  let cursor = 0

  return caseConfig.rewards.map(reward => {
    const min = cursor + 1
    cursor += reward.weight

    return {
      ...reward,
      ticketRange: {
        min,
        max: cursor,
      },
    }
  })
}

export const calculateVipCaseAvailability = ({
  tier,
  caseConfig,
  periodTheoreticalRake,
  openedThisPeriod,
  now = new Date(),
}: VipCaseAvailabilityInput): VipCaseAvailability => {
  const period = getVipCasePeriod(caseConfig.type, now)
  const missingTheoreticalRake = roundMoney(
    Math.max(
      0,
      caseConfig.minTheoreticalRake -
        normalizePositiveNumber(periodTheoreticalRake),
    ),
  )
  let lockedReason: VipCaseLockedReason = null

  if (!tierMeetsRequirement(tier, caseConfig.requiredTierId)) {
    lockedReason = 'tier'
  } else if (openedThisPeriod > 0) {
    lockedReason = 'cooldown'
  } else if (missingTheoreticalRake > 0) {
    lockedReason = 'activity'
  }

  return {
    canOpen: lockedReason === null,
    lockedReason,
    missingTheoreticalRake,
    nextOpenAt: lockedReason === 'cooldown' ? period.end.toISOString() : null,
    periodStart: period.start.toISOString(),
    periodEnd: period.end.toISOString(),
  }
}

export const drawVipCaseReward = (
  caseType: VipRewardCaseType,
  random: () => number = Math.random,
): {
  caseType: VipRewardCaseType
  amount: number
  ticket: number
  ticketRange: VipCaseTicketRange
} => {
  const config = VIP_REWARD_CASES[caseType]
  const rewards = getVipCaseRewardTicketRanges(config)
  const totalWeight = rewards[rewards.length - 1]?.ticketRange.max ?? 0

  if (totalWeight <= 0) {
    return {
      caseType,
      amount: 0,
      ticket: 0,
      ticketRange: { min: 0, max: 0 },
    }
  }

  const ticket = Math.min(
    totalWeight,
    Math.max(1, Math.floor(random() * totalWeight) + 1),
  )

  for (const reward of rewards) {
    if (ticket >= reward.ticketRange.min && ticket <= reward.ticketRange.max) {
      return {
        caseType,
        amount: reward.amount,
        ticket,
        ticketRange: reward.ticketRange,
      }
    }
  }

  const fallbackReward = rewards[rewards.length - 1]

  return {
    caseType,
    amount: fallbackReward?.amount ?? 0,
    ticket,
    ticketRange: fallbackReward?.ticketRange ?? { min: 0, max: 0 },
  }
}
