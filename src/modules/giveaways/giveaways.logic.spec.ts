import assert from 'node:assert/strict'

import {
  GIVEAWAY_TIERS,
  getEligibleDepositAmount,
  getGiveawayBotTarget,
  pickGiveawayBotId,
  pickGiveawayWinnerId,
  shouldJoinGiveawayBot,
  shouldMaintainActiveGiveaways,
} from './giveaways.logic'

assert.equal(
  pickGiveawayWinnerId([], () => 0),
  null,
)
assert.equal(
  pickGiveawayWinnerId([5], () => 0.75),
  5,
)
assert.equal(
  pickGiveawayWinnerId([5, 8, 13], () => 0),
  5,
)
assert.equal(
  pickGiveawayWinnerId([5, 8, 13], () => 0.999),
  13,
)

assert.equal(getGiveawayBotTarget(1, 8, 8), 8)
assert.ok(getGiveawayBotTarget(123, 8, 16) >= 8)
assert.ok(getGiveawayBotTarget(123, 8, 16) <= 16)
assert.ok(getGiveawayBotTarget(321, 20, 30) >= 20)
assert.ok(getGiveawayBotTarget(321, 20, 30) <= 30)
assert.ok(getGiveawayBotTarget(654, 50, 100) >= 50)
assert.ok(getGiveawayBotTarget(654, 50, 100) <= 100)

assert.deepEqual(
  GIVEAWAY_TIERS.map(tier => ({
    type: tier.type,
    minPrice: tier.minPrice,
    maxPrice: tier.maxPrice,
    fallbackMinPrice: tier.fallbackMinPrice,
    fallbackMaxPrice: tier.fallbackMaxPrice,
    requiredDepositAmount: tier.requiredDepositAmount,
    durationMs: tier.durationMs,
    minBots: tier.minBots,
    maxBots: tier.maxBots,
  })),
  [
    {
      type: 'DAILY_10',
      minPrice: 10,
      maxPrice: 10.99,
      fallbackMinPrice: 9.5,
      fallbackMaxPrice: 12,
      requiredDepositAmount: 1,
      durationMs: 24 * 60 * 60 * 1000,
      minBots: 20,
      maxBots: 30,
    },
    {
      type: 'GRAND_50',
      minPrice: 50,
      maxPrice: 50.99,
      fallbackMinPrice: 50,
      fallbackMaxPrice: 60,
      requiredDepositAmount: 10,
      durationMs: 3 * 24 * 60 * 60 * 1000,
      minBots: 50,
      maxBots: 100,
    },
  ],
)

assert.equal(shouldMaintainActiveGiveaways(['DAILY_10', 'GRAND_50']), false)
assert.equal(shouldMaintainActiveGiveaways(['DAILY_10']), true)
assert.equal(shouldMaintainActiveGiveaways([]), true)
assert.equal(shouldMaintainActiveGiveaways(['DAILY_10', 'LEGACY']), true)
assert.equal(shouldMaintainActiveGiveaways(['DAILY_10', null]), true)

assert.equal(
  shouldJoinGiveawayBot({
    botParticipantCount: 0,
    botTarget: 20,
    elapsedMs: 0,
    durationMs: 24 * 60 * 60 * 1000,
    random: () => 0,
  }),
  false,
)
assert.equal(
  shouldJoinGiveawayBot({
    botParticipantCount: 20,
    botTarget: 20,
    elapsedMs: 12 * 60 * 60 * 1000,
    durationMs: 24 * 60 * 60 * 1000,
    random: () => 0,
  }),
  false,
)
assert.equal(
  shouldJoinGiveawayBot({
    botParticipantCount: 9,
    botTarget: 20,
    elapsedMs: 12 * 60 * 60 * 1000,
    durationMs: 24 * 60 * 60 * 1000,
    random: () => 0.99,
  }),
  true,
)
assert.equal(
  shouldJoinGiveawayBot({
    botParticipantCount: 10,
    botTarget: 20,
    elapsedMs: 12 * 60 * 60 * 1000,
    durationMs: 24 * 60 * 60 * 1000,
    random: () => 0,
  }),
  false,
)
assert.equal(
  shouldJoinGiveawayBot({
    botParticipantCount: 10,
    botTarget: 20,
    elapsedMs: 12.5 * 60 * 60 * 1000,
    durationMs: 24 * 60 * 60 * 1000,
    random: () => 0.4,
  }),
  true,
)
assert.equal(
  shouldJoinGiveawayBot({
    botParticipantCount: 10,
    botTarget: 20,
    elapsedMs: 12.5 * 60 * 60 * 1000,
    durationMs: 24 * 60 * 60 * 1000,
    random: () => 0.5,
  }),
  false,
)

assert.equal(pickGiveawayBotId([10, 11, 12], [10, 12], () => 0), 11)
assert.equal(pickGiveawayBotId([10, 11, 12], [10, 11, 12], () => 0), null)

assert.equal(
  getEligibleDepositAmount({
    ledgerRowsCount: 0,
    ledgerAmount30d: 0,
    legacyDepositAmount: 286.7,
  }),
  286.7,
)
assert.equal(
  getEligibleDepositAmount({
    ledgerRowsCount: 3,
    ledgerAmount30d: 8.25,
    legacyDepositAmount: 286.7,
  }),
  8.25,
)
assert.equal(
  getEligibleDepositAmount({
    ledgerRowsCount: 3,
    ledgerAmount30d: 0,
    legacyDepositAmount: 286.7,
  }),
  0,
)

console.log('giveaways.logic.spec.ts passed')
