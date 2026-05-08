import assert from 'node:assert/strict'

import {
  UPGRADE_HOUSE_RETURN,
  calculateUpgradeChanceByPrice,
} from './upgrade-game.logic'

assert.equal(UPGRADE_HOUSE_RETURN, 0.96)
assert.equal(calculateUpgradeChanceByPrice(40, 100), 38.4)
assert.equal(calculateUpgradeChanceByPrice(80, 100), 76.8)

console.log('upgrade-game.logic.spec.ts passed')
