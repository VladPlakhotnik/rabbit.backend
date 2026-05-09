import 'reflect-metadata'
import assert from 'node:assert/strict'

import { RewardsService } from './rewards.service'
import { RewardType } from './enums/reward-type.enum'

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000

void (async () => {
  const cooldownRows: unknown[] = []
  const now = Date.now()
  const rewardRows = [
    {
      id: 1,
      type: RewardType.BALANCE,
      name: 'Balance top-up',
      value: 5,
      drop_chance: 1,
      is_active: true,
      created_at: new Date(),
    },
    {
      id: 2,
      type: RewardType.CARROTS,
      name: 'Clicker carrots',
      value: 1000,
      drop_chance: 1,
      is_active: true,
      created_at: new Date(),
    },
  ]
  const rewardsService = new RewardsService(
    {
      find: async () => rewardRows,
    } as never,
    {
      findOne: async () => null,
      create: (value: unknown) => value,
      save: async (value: unknown) => {
        cooldownRows.push(value)
        return value
      },
    } as never,
    {
      createWheelBonus: async () => ({ id: 50 }),
    } as never,
  )

  const result = await rewardsService.spin(99)

  const delta = result.nextAvailableAt.getTime() - now
  assert.ok(delta >= TWO_DAYS_MS - 1_000)
  assert.ok(delta <= TWO_DAYS_MS + 1_000)
  assert.equal(cooldownRows.length, 1)

  const catalog = await rewardsService.getCatalog()
  assert.deepEqual(
    catalog.map(reward => reward.type),
    [RewardType.BALANCE, RewardType.CARROTS],
  )

  console.log('rewards.service.spec.ts passed')
})()
