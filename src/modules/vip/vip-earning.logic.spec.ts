import assert from 'node:assert/strict'

import {
  CRASH_PRODUCT_HOUSE_EDGE_BPS,
  MINES_PRODUCT_HOUSE_EDGE_BPS,
  UPGRADE_PRODUCT_HOUSE_EDGE_BPS,
  calculateFixedHouseEdgeVipEarning,
  calculateVipEarning,
  estimateCaseHouseEdgeBps,
  estimateUpgradeHouseEdgeBps,
} from './vip-earning.logic'

const balancedCase = [
  { chance: 50, marketPrice: 6 },
  { chance: 50, marketPrice: 2 },
]

assert.equal(estimateCaseHouseEdgeBps(5, balancedCase), 2000)

const highMarginEarning = calculateVipEarning({
  sourceType: 'case_open',
  wagerAmount: 50,
  houseEdgeBps: 2000,
  productXpRateBps: 10000,
})

assert.equal(highMarginEarning.wagerAmount, 50)
assert.equal(highMarginEarning.theoreticalRake, 10)
assert.equal(highMarginEarning.vipXp, 100)
assert.equal(highMarginEarning.houseEdgeBps, 2000)

const lowMarginEarning = calculateVipEarning({
  sourceType: 'case_open',
  wagerAmount: 50,
  houseEdgeBps: 500,
  productXpRateBps: 10000,
})

assert.equal(lowMarginEarning.theoreticalRake, 2.5)
assert.equal(lowMarginEarning.vipXp, 25)

const negativeMarginCase = [{ chance: 100, marketPrice: 12 }]

assert.equal(estimateCaseHouseEdgeBps(10, negativeMarginCase), 0)

const noMarginEarning = calculateVipEarning({
  sourceType: 'case_open',
  wagerAmount: 50,
  houseEdgeBps: 0,
  productXpRateBps: 10000,
})

assert.equal(noMarginEarning.theoreticalRake, 0)
assert.equal(noMarginEarning.vipXp, 0)

const halfRateEarning = calculateVipEarning({
  sourceType: 'case_open',
  wagerAmount: 50,
  houseEdgeBps: 2000,
  productXpRateBps: 5000,
})

assert.equal(halfRateEarning.vipXp, 50)

const minesEarning = calculateFixedHouseEdgeVipEarning({
  sourceType: 'mines_round',
  wagerAmount: 25,
  houseEdgeBps: MINES_PRODUCT_HOUSE_EDGE_BPS,
})

assert.equal(minesEarning.theoreticalRake, 1)
assert.equal(minesEarning.vipXp, 10)

const crashEarning = calculateFixedHouseEdgeVipEarning({
  sourceType: 'crash_round',
  wagerAmount: 20,
  houseEdgeBps: CRASH_PRODUCT_HOUSE_EDGE_BPS,
})

assert.equal(crashEarning.theoreticalRake, 0.6)
assert.equal(crashEarning.vipXp, 6)

assert.equal(
  estimateUpgradeHouseEdgeBps({
    sourceAmount: 40,
    targetMarketPrice: 100,
    winChancePercent: 38.4,
  }),
  UPGRADE_PRODUCT_HOUSE_EDGE_BPS,
)

console.log('vip-earning.logic.spec.ts passed')
