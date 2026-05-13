export const pickGiveawayWinnerId = (
  participantIds: number[],
  random: () => number = Math.random,
): number | null => {
  if (participantIds.length === 0) {
    return null
  }

  const index = Math.min(
    participantIds.length - 1,
    Math.floor(random() * participantIds.length),
  )

  return participantIds[index] ?? null
}

const DAY_MS = 24 * 60 * 60 * 1000

export type GiveawayType = 'DAILY_10' | 'GRAND_50'

export interface GiveawayTierConfig {
  type: GiveawayType
  name: string
  targetPrice: number
  minPrice: number
  maxPrice: number
  fallbackMinPrice: number
  fallbackMaxPrice: number
  requiredDepositAmount: number
  durationMs: number
  minBots: number
  maxBots: number
}

export const GIVEAWAY_TIERS: readonly GiveawayTierConfig[] = [
  {
    type: 'DAILY_10',
    name: 'Daily Skin Drop',
    targetPrice: 10.5,
    minPrice: 10,
    maxPrice: 10.99,
    fallbackMinPrice: 9.5,
    fallbackMaxPrice: 12,
    requiredDepositAmount: 1,
    durationMs: DAY_MS,
    minBots: 20,
    maxBots: 30,
  },
  {
    type: 'GRAND_50',
    name: 'Grand Skin Drop',
    targetPrice: 50.5,
    minPrice: 50,
    maxPrice: 50.99,
    fallbackMinPrice: 50,
    fallbackMaxPrice: 60,
    requiredDepositAmount: 10,
    durationMs: 3 * DAY_MS,
    minBots: 50,
    maxBots: 100,
  },
]

export const findGiveawayTier = (
  type: string | null | undefined,
): GiveawayTierConfig | null =>
  GIVEAWAY_TIERS.find(tier => tier.type === type) ?? null

export const shouldMaintainActiveGiveaways = (
  activeTypes: Array<string | null | undefined>,
  tiers: readonly GiveawayTierConfig[] = GIVEAWAY_TIERS,
): boolean => {
  const requiredTypes = tiers.map(tier => tier.type)
  const supportedTypes = new Set<string>(requiredTypes)
  const activeTypeSet = new Set(
    activeTypes.filter((type): type is string => Boolean(type)),
  )

  return (
    activeTypes.some(type => !type || !supportedTypes.has(type)) ||
    requiredTypes.some(type => !activeTypeSet.has(type))
  )
}

const hashToUnit = (input: string): number => {
  let hash = 2166136261

  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0) / 0xffffffff
}

export const getGiveawayBotTarget = (
  giveawayId: number,
  minBots = 8,
  maxBots = 16,
): number => {
  if (maxBots <= minBots) {
    return minBots
  }

  const span = maxBots - minBots + 1
  return minBots + Math.floor(hashToUnit(`giveaway:${giveawayId}:bots`) * span)
}

export const shouldJoinGiveawayBot = ({
  botParticipantCount,
  botTarget,
  elapsedMs,
  durationMs,
  random = Math.random,
}: {
  botParticipantCount: number
  botTarget: number
  elapsedMs: number
  durationMs: number
  random?: () => number
}): boolean => {
  if (durationMs <= 0 || elapsedMs <= 0 || botParticipantCount >= botTarget) {
    return false
  }

  const elapsedRatio = Math.min(1, Math.max(0, elapsedMs / durationMs))
  const expectedBots = elapsedRatio * botTarget
  const guaranteedBots = Math.floor(expectedBots)
  const fractionalBotChance = expectedBots - guaranteedBots
  const allowedBots =
    guaranteedBots + (random() < fractionalBotChance ? 1 : 0)

  return botParticipantCount < Math.min(botTarget, allowedBots)
}

export const pickGiveawayBotId = (
  botIds: number[],
  participantIds: number[],
  random: () => number = Math.random,
): number | null => {
  const participantSet = new Set(participantIds)
  const availableBotIds = botIds.filter(botId => !participantSet.has(botId))

  if (availableBotIds.length === 0) {
    return null
  }

  const index = Math.min(
    availableBotIds.length - 1,
    Math.floor(random() * availableBotIds.length),
  )

  return availableBotIds[index] ?? null
}

export const getEligibleDepositAmount = ({
  ledgerRowsCount,
  ledgerAmount30d,
  legacyDepositAmount,
}: {
  ledgerRowsCount: number
  ledgerAmount30d: number
  legacyDepositAmount: number
}): number => {
  if (ledgerRowsCount > 0) {
    return Math.max(0, ledgerAmount30d)
  }

  return Math.max(0, legacyDepositAmount)
}
