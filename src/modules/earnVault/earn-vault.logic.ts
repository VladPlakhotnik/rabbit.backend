export type EarnVaultPlanId = 'flexible' | 'starter' | 'growth' | 'diamond'

export interface EarnVaultPlan {
  id: EarnVaultPlanId
  name: string
  durationDays: number
  ratePercent: number
  minAmount: number
  maxAmount: number
  accent: string
}

export interface EarnVaultMaturityInput {
  duration_days?: number
  ends_at: Date
}

export const EARN_VAULT_PLANS: readonly EarnVaultPlan[] = [
  {
    id: 'flexible',
    name: 'Flexible Vault',
    durationDays: 0,
    ratePercent: 4,
    minAmount: 1,
    maxAmount: 250,
    accent: '#6dea5d',
  },
  {
    id: 'starter',
    name: 'Starter Vault',
    durationDays: 7,
    ratePercent: 7,
    minAmount: 5,
    maxAmount: 500,
    accent: '#49d2ff',
  },
  {
    id: 'growth',
    name: 'Growth Vault',
    durationDays: 14,
    ratePercent: 11,
    minAmount: 10,
    maxAmount: 750,
    accent: '#ffcc48',
  },
  {
    id: 'diamond',
    name: 'Diamond Vault',
    durationDays: 30,
    ratePercent: 18,
    minAmount: 25,
    maxAmount: 1000,
    accent: '#8d7cff',
  },
] as const

const MONEY_MULTIPLIER = 100
const MS_PER_DAY = 24 * 60 * 60 * 1000
const MS_PER_YEAR = 365 * MS_PER_DAY

const toFiniteNumber = (value: unknown): number | null => {
  const numeric = typeof value === 'number' ? value : Number(value)

  return Number.isFinite(numeric) ? numeric : null
}

export const normaliseStakeAmount = (value: unknown): number => {
  const numeric = toFiniteNumber(value)
  if (numeric === null) {
    return 0
  }

  return Math.floor((numeric + Number.EPSILON) * MONEY_MULTIPLIER) / MONEY_MULTIPLIER
}

export const isValidStakeAmount = (value: unknown): boolean => {
  const numeric = toFiniteNumber(value)
  if (numeric === null || numeric <= 0) {
    return false
  }

  const cents = numeric * MONEY_MULTIPLIER
  return Math.abs(cents - Math.round(cents)) < 1e-8
}

export const roundMoney = (value: number): number =>
  Math.round((value + Number.EPSILON) * MONEY_MULTIPLIER) / MONEY_MULTIPLIER

export const calculateEarnVaultReward = (
  amount: number,
  plan: Pick<EarnVaultPlan, 'ratePercent' | 'durationDays'>,
): number => {
  if (plan.durationDays <= 0) {
    return 0
  }

  return roundMoney((amount * plan.ratePercent * plan.durationDays) / 100 / 365)
}

export const calculateEarnVaultAccruedReward = (
  amount: number,
  plan: Pick<EarnVaultPlan, 'ratePercent'>,
  startsAt: Date,
  now = new Date(),
): number => {
  const elapsedMs = Math.max(0, now.getTime() - startsAt.getTime())

  return roundMoney((amount * plan.ratePercent * elapsedMs) / 100 / MS_PER_YEAR)
}

export const isEarnVaultFlexible = (
  position: Pick<EarnVaultMaturityInput, 'duration_days'>,
): boolean => position.duration_days === 0

export const getEarnVaultPlan = (planId: string): EarnVaultPlan | undefined =>
  EARN_VAULT_PLANS.find(plan => plan.id === planId)

export const getEarnVaultEndDate = (start: Date, durationDays: number): Date =>
  new Date(start.getTime() + Math.max(0, durationDays) * MS_PER_DAY)

export const isEarnVaultPositionMature = (
  position: EarnVaultMaturityInput,
  now = new Date(),
): boolean =>
  isEarnVaultFlexible(position) || now.getTime() >= position.ends_at.getTime()

export const calculateEarnVaultProgress = (
  startsAt: Date,
  endsAt: Date,
  now = new Date(),
): number => {
  const totalMs = endsAt.getTime() - startsAt.getTime()
  if (totalMs <= 0) {
    return 100
  }

  const elapsedMs = now.getTime() - startsAt.getTime()
  const progress = (elapsedMs / totalMs) * 100

  return Math.max(0, Math.min(100, roundMoney(progress)))
}
