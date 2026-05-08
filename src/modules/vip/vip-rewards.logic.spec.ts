import assert from 'node:assert/strict'

import {
  VIP_REWARD_CASES,
  calculateAvailableCashback,
  calculateVipCaseAvailability,
  calculateVipCaseExpectedValue,
  getVipCaseRewardTicketRanges,
  drawVipCaseReward,
  getVipCasePeriod,
  getVipRewardCaseBySlug,
  getVipTierForXp,
  getWeeklyVipPeriod,
} from './vip-rewards.logic'

const goldTier = getVipTierForXp(500)

assert.equal(goldTier.id, 'gold')

const period = getWeeklyVipPeriod(new Date('2026-05-07T12:00:00.000Z'))

assert.equal(period.start.toISOString(), '2026-05-04T00:00:00.000Z')
assert.equal(period.end.toISOString(), '2026-05-11T00:00:00.000Z')

assert.equal(
  calculateAvailableCashback({
    tier: goldTier,
    periodTheoreticalRake: 100,
    claimedCashback: 1,
  }),
  2.5,
)

assert.equal(
  calculateAvailableCashback({
    tier: goldTier,
    periodTheoreticalRake: 10_000,
    claimedCashback: 0,
  }),
  goldTier.weeklyCashbackCap,
)

assert.equal(VIP_REWARD_CASES.gold.requiredTierId, 'gold')
assert.equal(VIP_REWARD_CASES.daily.cooldown, 'daily')
assert.equal(VIP_REWARD_CASES.gold.cooldown, 'weekly')
assert.equal(VIP_REWARD_CASES.diamond.requiredTierId, 'diamond')
assert.equal(VIP_REWARD_CASES.diamond.cooldown, 'weekly')
assert.equal(VIP_REWARD_CASES.black.cooldown, 'monthly')
assert.equal(VIP_REWARD_CASES.daily.rewards.length, 10)
assert.equal(VIP_REWARD_CASES.gold.rewards.length, 10)
assert.equal(VIP_REWARD_CASES.diamond.rewards.length, 10)
assert.equal(VIP_REWARD_CASES.black.rewards.length, 10)
assert.equal(drawVipCaseReward('daily', () => 0).amount, 0.02)
assert.equal(drawVipCaseReward('daily', () => 0.99).amount, 1)
assert.equal(drawVipCaseReward('daily', () => 0.999).amount, 2)
assert.deepEqual(
  getVipCaseRewardTicketRanges(VIP_REWARD_CASES.daily).map(reward => ({
    amount: reward.amount,
    ticketRange: reward.ticketRange,
  })),
  [
    { amount: 0.02, ticketRange: { min: 1, max: 2200 } },
    { amount: 0.03, ticketRange: { min: 2201, max: 4400 } },
    { amount: 0.05, ticketRange: { min: 4401, max: 6200 } },
    { amount: 0.08, ticketRange: { min: 6201, max: 7600 } },
    { amount: 0.1, ticketRange: { min: 7601, max: 8600 } },
    { amount: 0.15, ticketRange: { min: 8601, max: 9300 } },
    { amount: 0.25, ticketRange: { min: 9301, max: 9700 } },
    { amount: 0.5, ticketRange: { min: 9701, max: 9900 } },
    { amount: 1, ticketRange: { min: 9901, max: 9980 } },
    { amount: 2, ticketRange: { min: 9981, max: 10000 } },
  ],
)
assert.deepEqual(
  drawVipCaseReward('daily', () => 0),
  {
    caseType: 'daily',
    amount: 0.02,
    ticket: 1,
    ticketRange: { min: 1, max: 2200 },
  },
)
assert.equal(drawVipCaseReward('daily', () => 0.99999).ticket, 10000)
assert.equal(calculateVipCaseExpectedValue(VIP_REWARD_CASES.daily), 0.08)
assert.equal(getVipRewardCaseBySlug('daily-spark')?.type, 'daily')
assert.equal(getVipRewardCaseBySlug('daily')?.type, 'daily')
assert.equal(getVipRewardCaseBySlug('vip-diamond')?.type, 'diamond')
assert.equal(getVipRewardCaseBySlug('unknown'), null)

const dailyPeriod = getVipCasePeriod(
  'daily',
  new Date('2026-05-07T12:00:00.000Z'),
)
assert.equal(dailyPeriod.start.toISOString(), '2026-05-07T00:00:00.000Z')
assert.equal(dailyPeriod.end.toISOString(), '2026-05-08T00:00:00.000Z')

const weeklyCasePeriod = getVipCasePeriod(
  'gold',
  new Date('2026-05-07T12:00:00.000Z'),
)
assert.equal(weeklyCasePeriod.start.toISOString(), '2026-05-04T00:00:00.000Z')
assert.equal(weeklyCasePeriod.end.toISOString(), '2026-05-11T00:00:00.000Z')

const monthlyPeriod = getVipCasePeriod(
  'black',
  new Date('2026-05-07T12:00:00.000Z'),
)
assert.equal(monthlyPeriod.start.toISOString(), '2026-05-01T00:00:00.000Z')
assert.equal(monthlyPeriod.end.toISOString(), '2026-06-01T00:00:00.000Z')

assert.deepEqual(
  calculateVipCaseAvailability({
    tier: goldTier,
    caseConfig: VIP_REWARD_CASES.gold,
    periodTheoreticalRake: 20,
    openedThisPeriod: 0,
    now: new Date('2026-05-07T12:00:00.000Z'),
  }),
  {
    canOpen: true,
    lockedReason: null,
    missingTheoreticalRake: 0,
    nextOpenAt: null,
    periodStart: '2026-05-04T00:00:00.000Z',
    periodEnd: '2026-05-11T00:00:00.000Z',
  },
)

assert.equal(
  calculateVipCaseAvailability({
    tier: getVipTierForXp(100),
    caseConfig: VIP_REWARD_CASES.gold,
    periodTheoreticalRake: 20,
    openedThisPeriod: 0,
    now: new Date('2026-05-07T12:00:00.000Z'),
  }).lockedReason,
  'tier',
)

assert.equal(
  calculateVipCaseAvailability({
    tier: goldTier,
    caseConfig: VIP_REWARD_CASES.gold,
    periodTheoreticalRake: 5,
    openedThisPeriod: 0,
    now: new Date('2026-05-07T12:00:00.000Z'),
  }).lockedReason,
  'activity',
)

assert.equal(
  calculateVipCaseAvailability({
    tier: goldTier,
    caseConfig: VIP_REWARD_CASES.gold,
    periodTheoreticalRake: 20,
    openedThisPeriod: 1,
    now: new Date('2026-05-07T12:00:00.000Z'),
  }).lockedReason,
  'cooldown',
)

console.log('vip-rewards.logic.spec.ts passed')
