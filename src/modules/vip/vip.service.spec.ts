import assert from 'node:assert/strict'

import { User } from '../users/user.entity'
import { VipService } from './vip.service'

const savedEntities: unknown[] = []
const notifications: unknown[] = []

const manager = {
  create: (_entity: unknown, data: unknown) => data,
  save: async (entityOrValue: unknown, maybeValue?: unknown) => {
    const value = maybeValue ?? entityOrValue
    savedEntities.push(value)
    return value
  },
}

const user = Object.assign(new User(), {
  id: 12,
  vip_xp: 100,
  vip_theoretical_rake: 10,
  vip_qualifying_volume: 100,
})

const notificationService = {
  notifyVipLevelUp: async (...args: unknown[]) => {
    notifications.push(args)
  },
}

const vipService = new VipService(notificationService as never)

void (async () => {
  await vipService.recordEarning(manager as never, user, {
    sourceType: 'mines_round',
    sourceId: 'mines:42',
    wagerAmount: 25,
    houseEdgeBps: 400,
    productXpRateBps: 10000,
    theoreticalRake: 1,
    vipXp: 10,
    metadata: { minesCount: 5 },
  })

  assert.equal(user.vip_xp, 110)
  assert.equal(user.vip_theoretical_rake, 11)
  assert.equal(user.vip_qualifying_volume, 110)
  assert.equal(savedEntities.length, 2)
  assert.ok(savedEntities[0] instanceof User)
  assert.deepEqual(savedEntities[1], {
    user_id: 12,
    source_type: 'mines_round',
    source_id: 'mines:42',
    wager_amount: 25,
    house_edge_bps: 400,
    product_xp_rate_bps: 10000,
    theoretical_rake: 1,
    vip_xp: 10,
    metadata: { minesCount: 5 },
  })
  assert.equal(notifications.length, 0)

  savedEntities.length = 0
  notifications.length = 0

  await vipService.recordEarning(manager as never, user, {
    sourceType: 'upgrade_attempt',
    sourceId: 'upgrade:9',
    wagerAmount: 25,
    houseEdgeBps: 0,
    productXpRateBps: 10000,
    theoreticalRake: 0,
    vipXp: 0,
  })

  assert.equal(savedEntities.length, 0)

  const nearGoldUser = Object.assign(new User(), {
    id: 20,
    vip_xp: 490,
    vip_theoretical_rake: 49,
    vip_qualifying_volume: 490,
  })

  await vipService.recordEarning(manager as never, nearGoldUser, {
    sourceType: 'case_open',
    sourceId: 'case:77',
    wagerAmount: 25,
    houseEdgeBps: 400,
    productXpRateBps: 10000,
    theoreticalRake: 1,
    vipXp: 10,
  })

  assert.equal(nearGoldUser.vip_xp, 500)
  assert.deepEqual(notifications, [[20, 'gold', 500]])

  console.log('vip.service.spec.ts passed')
})()
