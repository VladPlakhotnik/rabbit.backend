export type BotWealthTier = 'low' | 'mid' | 'high' | 'whale'
export type BotArchetype =
  | 'cautious'
  | 'grinder'
  | 'sniper'
  | 'swingy'
  | 'collector'
  | 'highroller'
export type BotFavoriteGame = 'cases' | 'mines' | 'crash' | 'mixed'
export type BotGameMode = 'cases' | 'mines' | 'crash'

export interface BotUserSnapshot {
  id: number
  display_name: string
  avatar: string | null
}

export interface BotProfileSnapshot extends BotUserSnapshot {
  wealthTier: BotWealthTier
  archetype: BotArchetype
  favoriteGame: BotFavoriteGame
  virtualBankroll: number
  minStake: number
  maxStake: number
  riskAppetite: number
  patience: number
  impulsivity: number
  lossChasing: number
  confidence: number
}

export interface MinesBotSettings {
  minesCountBias: number
  cashoutProbability: number
  revealCap: number
}

const WEALTH_TIERS: readonly BotWealthTier[] = ['low', 'mid', 'high', 'whale']
const ARCHETYPES: readonly BotArchetype[] = [
  'cautious',
  'grinder',
  'sniper',
  'swingy',
  'collector',
  'highroller',
]
const FAVORITE_GAMES: readonly BotFavoriteGame[] = [
  'cases',
  'mines',
  'crash',
  'mixed',
]

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

export const roundBotMoney = (value: number): number =>
  Number(Math.max(0, value).toFixed(2))

const hashToUnit = (input: string): number => {
  let hash = 2166136261

  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0) / 0xffffffff
}

const pickByHash = <T>(items: readonly T[], seed: string): T => {
  const index = Math.min(
    items.length - 1,
    Math.floor(hashToUnit(seed) * items.length),
  )

  return items[index]
}

const getBankrollForTier = (
  tier: BotWealthTier,
  seed: string,
): number => {
  const roll = hashToUnit(`${seed}:bankroll`)

  if (tier === 'whale') return roundBotMoney(2_500 + roll * 8_000)
  if (tier === 'high') return roundBotMoney(650 + roll * 2_100)
  if (tier === 'mid') return roundBotMoney(120 + roll * 560)

  return roundBotMoney(24 + roll * 96)
}

const getStakeRangeForTier = (
  tier: BotWealthTier,
  bankroll: number,
): { minStake: number; maxStake: number } => {
  if (tier === 'whale') {
    return {
      minStake: 20,
      maxStake: roundBotMoney(Math.min(900, bankroll * 0.16)),
    }
  }

  if (tier === 'high') {
    return {
      minStake: 5,
      maxStake: roundBotMoney(Math.min(220, bankroll * 0.13)),
    }
  }

  if (tier === 'mid') {
    return {
      minStake: 1,
      maxStake: roundBotMoney(Math.min(45, bankroll * 0.11)),
    }
  }

  return {
    minStake: 0.5,
    maxStake: roundBotMoney(Math.min(8, bankroll * 0.09)),
  }
}

const getWealthTier = (seed: string): BotWealthTier => {
  const roll = hashToUnit(`${seed}:wealth`)

  if (roll > 0.96) return 'whale'
  if (roll > 0.82) return 'high'
  if (roll > 0.42) return 'mid'

  return 'low'
}

const archetypeTrait = (
  archetype: BotArchetype,
): Pick<
  BotProfileSnapshot,
  'riskAppetite' | 'patience' | 'impulsivity' | 'lossChasing' | 'confidence'
> => {
  switch (archetype) {
    case 'cautious':
      return {
        riskAppetite: 0.22,
        patience: 0.36,
        impulsivity: 0.08,
        lossChasing: 0.16,
        confidence: 0.38,
      }
    case 'grinder':
      return {
        riskAppetite: 0.36,
        patience: 0.58,
        impulsivity: 0.14,
        lossChasing: 0.25,
        confidence: 0.52,
      }
    case 'sniper':
      return {
        riskAppetite: 0.42,
        patience: 0.8,
        impulsivity: 0.1,
        lossChasing: 0.18,
        confidence: 0.72,
      }
    case 'swingy':
      return {
        riskAppetite: 0.68,
        patience: 0.5,
        impulsivity: 0.55,
        lossChasing: 0.66,
        confidence: 0.6,
      }
    case 'collector':
      return {
        riskAppetite: 0.48,
        patience: 0.43,
        impulsivity: 0.32,
        lossChasing: 0.24,
        confidence: 0.5,
      }
    case 'highroller':
      return {
        riskAppetite: 0.78,
        patience: 0.6,
        impulsivity: 0.34,
        lossChasing: 0.52,
        confidence: 0.75,
      }
  }
}

export const buildDefaultBotProfile = (
  user: BotUserSnapshot,
): BotProfileSnapshot => {
  const seed = `${user.id}:${user.display_name}`
  const wealthTier = getWealthTier(seed)
  const archetype = pickByHash(ARCHETYPES, `${seed}:archetype`)
  const favoriteGame = pickByHash(FAVORITE_GAMES, `${seed}:favorite-game`)
  const virtualBankroll = getBankrollForTier(wealthTier, seed)
  const stakeRange = getStakeRangeForTier(wealthTier, virtualBankroll)
  const traits = archetypeTrait(archetype)
  const jitter = (name: string, amount = 0.08): number =>
    (hashToUnit(`${seed}:${name}`) - 0.5) * amount

  return {
    id: user.id,
    display_name: user.display_name,
    avatar: user.avatar,
    wealthTier,
    archetype,
    favoriteGame,
    virtualBankroll,
    minStake: stakeRange.minStake,
    maxStake: Math.max(stakeRange.minStake, stakeRange.maxStake),
    riskAppetite: clamp(traits.riskAppetite + jitter('risk'), 0.05, 0.95),
    patience: clamp(traits.patience + jitter('patience'), 0.05, 0.95),
    impulsivity: clamp(
      traits.impulsivity + jitter('impulsivity', 0.12),
      0.02,
      0.9,
    ),
    lossChasing: clamp(
      traits.lossChasing + jitter('loss-chasing', 0.12),
      0.02,
      0.9,
    ),
    confidence: clamp(traits.confidence + jitter('confidence'), 0.05, 0.95),
  }
}

const getModeStakeFactor = (
  profile: BotProfileSnapshot,
  mode: BotGameMode,
): number => {
  const favoriteBoost =
    profile.favoriteGame === mode || profile.favoriteGame === 'mixed'
      ? 1.12
      : 0.88

  if (mode === 'cases') return favoriteBoost * 0.78
  if (mode === 'mines') return favoriteBoost * 0.92

  return favoriteBoost
}

export const getStakePressure = (
  profile: Pick<BotProfileSnapshot, 'virtualBankroll'>,
  stake: number,
): number => {
  if (profile.virtualBankroll <= 0) return 1

  return clamp(stake / profile.virtualBankroll, 0, 1)
}

export const pickBotStake = (
  profile: BotProfileSnapshot,
  mode: BotGameMode,
  random: () => number = Math.random,
): number => {
  const riskWindow = 0.018 + profile.riskAppetite * 0.05
  const distributionPower = 2.4 - profile.riskAppetite * 1.4
  const shapedRoll = Math.pow(random(), distributionPower)
  const stake =
    profile.virtualBankroll *
    (0.006 + shapedRoll * riskWindow) *
    getModeStakeFactor(profile, mode)
  const maybeImpulse =
    random() < profile.impulsivity * 0.08
      ? stake * (1.5 + random() * 2.4)
      : stake

  return roundBotMoney(clamp(maybeImpulse, profile.minStake, profile.maxStake))
}

export const pickCrashCashoutTarget = (
  profile: BotProfileSnapshot,
  stake: number,
  random: () => number = Math.random,
): number => {
  const pressure = getStakePressure(profile, stake)

  if (pressure >= 0.24) {
    return roundBotMoney(1.08 + random() * (0.22 + profile.confidence * 0.05))
  }

  const patienceBand = profile.patience * 1.35
  const riskBand = profile.riskAppetite * 2.45
  const randomBand = Math.pow(random(), 1.4) * (0.5 + profile.riskAppetite * 2)
  const rawTarget = 1.1 + patienceBand + riskBand + randomBand
  const pressurePenalty = clamp(pressure * (4.8 - profile.confidence), 0, 0.86)
  const conservativeTarget = 1.05 + (rawTarget - 1.05) * (1 - pressurePenalty)
  const impulseBoost =
    random() < profile.impulsivity * 0.05 ? 1 + random() * 1.35 : 0

  return roundBotMoney(clamp(conservativeTarget + impulseBoost, 1.05, 18))
}

export const pickMinesBotSettings = (
  profile: BotProfileSnapshot,
  stake: number,
  random: () => number = Math.random,
): MinesBotSettings => {
  const pressure = getStakePressure(profile, stake)
  const risk = clamp(
    profile.riskAppetite + profile.confidence * 0.25 - pressure * 0.55,
    0.05,
    0.95,
  )
  const minesCountBias = clamp(
    risk * 0.72 + profile.impulsivity * 0.18 + random() * 0.1,
    0,
    1,
  )
  const cashoutProbability = clamp(
    0.84 - risk * 0.34 + pressure * 0.22 - profile.lossChasing * 0.12,
    0.38,
    0.9,
  )
  const revealCap = Math.max(
    1,
    Math.round(2 + risk * 5 + profile.patience * 2 - pressure * 5),
  )

  return {
    minesCountBias,
    cashoutProbability,
    revealCap,
  }
}
