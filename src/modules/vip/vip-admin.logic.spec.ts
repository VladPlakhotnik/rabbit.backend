import assert from 'node:assert/strict'

import { buildAdminVipCaseConfigs, countVipUsersByTier } from './vip-admin.logic'

const tierCounts = countVipUsersByTier([
  { vip_xp: 0 },
  { vip_xp: 499.99 },
  { vip_xp: 500 },
  { vip_xp: 5000 },
  { vip_xp: 15000 },
])

assert.deepEqual(tierCounts, {
  black: 1,
  bronze: 2,
  diamond: 1,
  gold: 1,
})

const cases = buildAdminVipCaseConfigs()
const daily = cases.find(item => item.type === 'daily')
const black = cases.find(item => item.type === 'black')

assert.equal(daily?.expectedValue, 0.08)
assert.equal(daily?.rewardCount, 10)
assert.equal(black?.maxReward, 500)
