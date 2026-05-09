import assert from 'node:assert/strict'

import {
  EARN_VAULT_PLANS,
  calculateEarnVaultAccruedReward,
  calculateEarnVaultReward,
  isValidStakeAmount,
  isEarnVaultPositionMature,
  normaliseStakeAmount,
} from './earn-vault.logic'

const flexiblePlan = EARN_VAULT_PLANS.find(plan => plan.id === 'flexible')
const starterPlan = EARN_VAULT_PLANS.find(plan => plan.id === 'starter')
const growthPlan = EARN_VAULT_PLANS.find(plan => plan.id === 'growth')
const diamondPlan = EARN_VAULT_PLANS.find(plan => plan.id === 'diamond')

assert.ok(flexiblePlan)
assert.ok(starterPlan)
assert.ok(growthPlan)
assert.ok(diamondPlan)
assert.equal(flexiblePlan.durationDays, 0)
assert.equal(flexiblePlan.ratePercent, 4)
assert.equal(starterPlan.durationDays, 7)
assert.equal(starterPlan.ratePercent, 7)
assert.equal(growthPlan.ratePercent, 11)
assert.equal(diamondPlan.ratePercent, 18)
assert.equal(normaliseStakeAmount(10.239), 10.23)
assert.equal(normaliseStakeAmount('25.50'), 25.5)
assert.equal(isValidStakeAmount(10.23), true)
assert.equal(isValidStakeAmount('25.50'), true)
assert.equal(isValidStakeAmount(10.239), false)
assert.equal(isValidStakeAmount('abc'), false)
assert.equal(calculateEarnVaultReward(100, starterPlan), 0.13)
assert.equal(calculateEarnVaultReward(100, growthPlan), 0.42)
assert.equal(calculateEarnVaultReward(100, diamondPlan), 1.48)
assert.equal(calculateEarnVaultReward(100, flexiblePlan), 0)
assert.equal(
  calculateEarnVaultAccruedReward(
    100,
    flexiblePlan,
    new Date('2026-05-09T00:00:00.000Z'),
    new Date('2026-05-10T00:00:00.000Z'),
  ),
  0.01,
)

assert.equal(
  isEarnVaultPositionMature(
    {
      duration_days: 0,
      ends_at: new Date('2099-01-01T00:00:00.000Z'),
    },
    new Date('2026-05-10T00:00:00.000Z'),
  ),
  true,
)

assert.equal(
  isEarnVaultPositionMature(
    { ends_at: new Date('2026-05-10T00:00:00.000Z') },
    new Date('2026-05-10T00:00:00.000Z'),
  ),
  true,
)

assert.equal(
  isEarnVaultPositionMature(
    { ends_at: new Date('2026-05-10T00:00:01.000Z') },
    new Date('2026-05-10T00:00:00.000Z'),
  ),
  false,
)

console.log('earn-vault.logic.spec.ts passed')
