import assert from 'node:assert/strict'
import {
  buildDefaultBotProfile,
  pickBotStake,
  pickCrashCashoutTarget,
  pickMinesBotSettings,
} from './bot-behavior.logic'

const sequence = (values: number[]): (() => number) => {
  const queue = [...values]
  return () => queue.shift() ?? values[values.length - 1] ?? 0
}

const lowProfile = {
  ...buildDefaultBotProfile({
    id: 11,
    display_name: 'QuietSprout',
    avatar: null,
  }),
  wealthTier: 'low' as const,
  virtualBankroll: 42,
  minStake: 0.5,
  maxStake: 7,
  riskAppetite: 0.35,
  patience: 0.45,
  impulsivity: 0.12,
}

const whaleProfile = {
  ...buildDefaultBotProfile({
    id: 12,
    display_name: 'VelvetOrbit',
    avatar: null,
  }),
  wealthTier: 'whale' as const,
  virtualBankroll: 6_500,
  minStake: 25,
  maxStake: 700,
  riskAppetite: 0.72,
  patience: 0.62,
  impulsivity: 0.2,
}

const lowStake = pickBotStake(lowProfile, 'crash', sequence([0.45, 0.9]))
const whaleStake = pickBotStake(whaleProfile, 'crash', sequence([0.45, 0.9]))

assert.ok(whaleStake > lowStake * 20)
assert.ok(lowStake >= lowProfile.minStake)
assert.ok(whaleStake <= whaleProfile.maxStake)

const smallCrashTarget = pickCrashCashoutTarget(
  lowProfile,
  1.5,
  sequence([0.55, 0.7]),
)
const allInCrashTarget = pickCrashCashoutTarget(
  lowProfile,
  30,
  sequence([0.55, 0.7]),
)

assert.ok(smallCrashTarget > allInCrashTarget)
assert.ok(allInCrashTarget <= 1.35)

const riskyMines = pickMinesBotSettings(whaleProfile, 25, sequence([0.8, 0.7]))
const cautiousMines = pickMinesBotSettings(lowProfile, 18, sequence([0.8, 0.7]))

assert.ok(riskyMines.cashoutProbability < cautiousMines.cashoutProbability)
assert.ok(cautiousMines.revealCap <= riskyMines.revealCap)

const profileA = buildDefaultBotProfile({
  id: 77,
  display_name: 'SameSeed',
  avatar: null,
})
const profileB = buildDefaultBotProfile({
  id: 77,
  display_name: 'SameSeed',
  avatar: null,
})

assert.deepEqual(profileA, profileB)
assert.ok(profileA.virtualBankroll >= profileA.minStake)
assert.ok(profileA.maxStake >= profileA.minStake)

console.log('bot-behavior.logic.spec.ts passed')
