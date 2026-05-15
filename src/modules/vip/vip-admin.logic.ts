import {
  VIP_REWARD_CASES,
  VIP_TIERS,
  type VipRewardCaseType,
  type VipTierId,
  calculateVipCaseExpectedValue,
  getVipCaseRewardTicketRanges,
  getVipTierForXp,
} from './vip-rewards.logic'

export type VipTierCounts = Record<VipTierId, number>

export interface VipUserTierInput {
  vip_xp?: number | string | null
  vip_qualifying_volume?: number | string | null
}

export interface AdminVipCaseConfig {
  cooldown: string
  expectedValue: number
  maxReward: number
  minReward: number
  minTheoreticalRake: number
  requiredTierId: VipTierId
  rewardCount: number
  rewards: ReturnType<typeof getVipCaseRewardTicketRanges>
  slug: string
  type: VipRewardCaseType
}

const toNumber = (value: number | string | null | undefined): number => {
  const parsed = Number(value ?? 0)

  return Number.isFinite(parsed) ? parsed : 0
}

export const createEmptyVipTierCounts = (): VipTierCounts =>
  VIP_TIERS.reduce(
    (counts, tier) => ({
      ...counts,
      [tier.id]: 0,
    }),
    {} as VipTierCounts,
  )

export const countVipUsersByTier = (
  users: readonly VipUserTierInput[],
): VipTierCounts => {
  const counts = createEmptyVipTierCounts()

  for (const user of users) {
    const xp = toNumber(user.vip_xp ?? user.vip_qualifying_volume)
    const tier = getVipTierForXp(xp)
    counts[tier.id] += 1
  }

  return counts
}

export const buildAdminVipCaseConfigs = (): AdminVipCaseConfig[] =>
  Object.values(VIP_REWARD_CASES).map(config => {
    const rewards = getVipCaseRewardTicketRanges(config)
    const amounts = rewards.map(reward => reward.amount)

    return {
      type: config.type,
      slug: config.slug,
      requiredTierId: config.requiredTierId,
      cooldown: config.cooldown,
      minTheoreticalRake: config.minTheoreticalRake,
      expectedValue: calculateVipCaseExpectedValue(config),
      rewardCount: rewards.length,
      minReward: Math.min(...amounts),
      maxReward: Math.max(...amounts),
      rewards,
    }
  })
