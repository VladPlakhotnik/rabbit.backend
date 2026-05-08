import assert from 'node:assert/strict'

import { User } from '../users/user.entity'
import { VipService } from './vip.service'

const savedEntities: unknown[] = []

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

const vipService = new VipService()

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

  savedEntities.length = 0

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

  console.log('vip.service.spec.ts passed')
})()
