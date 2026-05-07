import assert from 'node:assert/strict'
import { buildDefaultBotProfile } from '../bots/bot-behavior.logic'
import {
  buildCrashBotParticipant,
  generateCrashPoint,
  pickCrashParticipantCount,
  getVisibleCrashParticipants,
  getCrashRoundMultiplier,
  scheduleCrashParticipantJoins,
  settleCrashParticipants,
} from './crash-live.logic'

const sequence = (values: number[]): (() => number) => {
  const queue = [...values]
  return () => queue.shift() ?? values[values.length - 1] ?? 0
}

const profile = {
  ...buildDefaultBotProfile({
    id: 91,
    display_name: 'CashoutPilot',
    avatar: 'https://example.com/pilot.png',
  }),
  wealthTier: 'mid' as const,
  virtualBankroll: 180,
  minStake: 1,
  maxStake: 35,
  riskAppetite: 0.42,
  patience: 0.38,
  impulsivity: 0.08,
  confidence: 0.44,
}

const participant = buildCrashBotParticipant({
  profile,
  roundId: 7,
  slot: 1,
  random: sequence([0.5, 0.9, 0.45, 0.8]),
})

assert.equal(participant.owner, 'bot')
assert.equal(participant.userId, profile.id)
assert.equal(participant.playerName, profile.display_name)
assert.equal(participant.avatar, profile.avatar)
assert.ok(participant.stake >= profile.minStake)
assert.ok(participant.stake <= profile.maxStake)
assert.ok(participant.targetMultiplier >= 1.05)

const pressureParticipant = buildCrashBotParticipant({
  profile: {
    ...profile,
    virtualBankroll: 80,
    minStake: 30,
    maxStake: 70,
  },
  roundId: 8,
  slot: 1,
  random: sequence([0.99, 0.01, 0.7, 0.9]),
})

assert.ok(pressureParticipant.stake > 20)
assert.ok(pressureParticipant.targetMultiplier <= 1.35)

assert.equal(getCrashRoundMultiplier(0), 1)
assert.ok(getCrashRoundMultiplier(8_000) > getCrashRoundMultiplier(4_000))
assert.ok(
  getCrashRoundMultiplier(5_000) <= 1.35,
  `expected 5s multiplier to stay slow, got ${getCrashRoundMultiplier(5_000)}x`,
)
assert.ok(
  getCrashRoundMultiplier(11_000) < 2,
  `expected 11s multiplier to stay below x2, got ${getCrashRoundMultiplier(11_000)}x`,
)
assert.ok(
  getCrashRoundMultiplier(12_000) >= 2,
  `expected 12s multiplier to reach x2, got ${getCrashRoundMultiplier(12_000)}x`,
)
assert.ok(
  getCrashRoundMultiplier(16_000) - getCrashRoundMultiplier(12_000) >
    getCrashRoundMultiplier(8_000) - getCrashRoundMultiplier(4_000),
)
assert.ok(generateCrashPoint(sequence([0.01, 0.5])) < 1.4)
assert.ok(generateCrashPoint(sequence([0.7, 0.5, 0.5])) > 1.4)
assert.equal(pickCrashParticipantCount(sequence([0, 0])), 3)
assert.equal(pickCrashParticipantCount(sequence([0.999, 0.999])), 20)

const settled = settleCrashParticipants([participant], participant.targetMultiplier)
assert.equal(settled[0].status, 'cashed_out')
assert.ok(settled[0].payout > settled[0].stake)
assert.ok(settled[0].profit > 0)

const crashed = settleCrashParticipants([participant], 1.01)
assert.equal(crashed[0].status, 'crashed')
assert.equal(crashed[0].payout, 0)
assert.equal(crashed[0].profit, -participant.stake)

const scheduledParticipants = scheduleCrashParticipantJoins(
  [participant, { ...participant, id: 'second-bot' }],
  15_000,
  sequence([0, 0.99]),
)

assert.ok(scheduledParticipants.every(p => p.joinOffsetMs > 0))
assert.ok(scheduledParticipants.every(p => p.joinOffsetMs <= 14_300))
assert.deepEqual(getVisibleCrashParticipants(scheduledParticipants, 0, 'waiting'), [])
assert.deepEqual(
  getVisibleCrashParticipants(
    scheduledParticipants,
    Math.max(...scheduledParticipants.map(p => p.joinOffsetMs)) + 1,
    'waiting',
  ).map(p => p.id),
  scheduledParticipants.map(p => p.id),
)
assert.equal(
  getVisibleCrashParticipants(scheduledParticipants, 0, 'running').length,
  scheduledParticipants.length,
)

const burstyParticipants = scheduleCrashParticipantJoins(
  Array.from({ length: 12 }, (_, index) => ({
    ...participant,
    id: `clustered-bot-${index}`,
  })),
  15_000,
  sequence([
    0.4, 0.05, 0.08, 0.41, 0.43, 0.45, 0.47, 0.49, 0.5, 0.52, 0.54, 0.56,
    0.58, 0.6, 0.62, 0.64, 0.66, 0.68, 0.7, 0.72, 0.74, 0.76, 0.78, 0.8,
  ]),
)
const joinedSeconds = new Set(
  burstyParticipants.map(p => Math.floor(p.joinOffsetMs / 1000)),
)

assert.ok(
  joinedSeconds.size <= 6,
  `expected clustered joins, got ${joinedSeconds.size} distinct seconds`,
)

console.log('crash-live.logic.spec.ts passed')
