import assert from 'node:assert/strict'

import { pickGiveawayWinnerId } from './giveaways.logic'

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

console.log('giveaways.logic.spec.ts passed')
