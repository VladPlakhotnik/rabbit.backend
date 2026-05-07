import assert from 'node:assert/strict'
import {
  calculateCrashPayout,
  roundCrashMoney,
  splitCrashStake,
} from './crash-game.logic'

assert.equal(roundCrashMoney(1.005), 1)
assert.deepEqual(splitCrashStake(7.51, 1), [7.51])
assert.deepEqual(splitCrashStake(7.51, 2), [3.76, 3.75])
assert.equal(calculateCrashPayout(3.76, 1.5), 5.64)

console.log('crash-game.logic.spec.ts passed')
