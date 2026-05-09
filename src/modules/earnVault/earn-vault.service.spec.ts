import 'reflect-metadata'
import assert from 'node:assert/strict'

import { BadRequestException } from '@nestjs/common'
import { User } from '../users/user.entity'
import { EarnVaultPosition } from './earn-vault-position.entity'
import { calculateEarnVaultAccruedReward } from './earn-vault.logic'
import {
  EARN_VAULT_ACTIVE_POSITION_LIMIT,
  EARN_VAULT_POSITION_LIST_LIMIT,
  EarnVaultService,
} from './earn-vault.service'

const makeHarness = (options?: {
  activePositionCount?: number
  positions?: EarnVaultPosition[]
}) => {
  const saved: unknown[] = []
  const user = Object.assign(new User(), {
    id: 5,
    balance: 100,
  })
  const position = Object.assign(new EarnVaultPosition(), {
    id: '10',
    user_id: 5,
    plan_id: 'starter',
    plan_name: 'Starter Vault',
    status: 'active',
    amount: 10,
    reward_amount: 0.35,
    rate_percent: 0.35,
    duration_days: 1,
    starts_at: new Date('2026-05-01T00:00:00.000Z'),
    ends_at: new Date('2026-05-02T00:00:00.000Z'),
    claimed_at: null,
    cancelled_at: null,
    created_at: new Date('2026-05-01T00:00:00.000Z'),
    updated_at: new Date('2026-05-01T00:00:00.000Z'),
  })
  const positions = options?.positions ?? [position]

  const transactionalManager = {
    findOne: async (entity: unknown) => {
      if (entity === User) return user
      if (entity === EarnVaultPosition) return position

      return null
    },
    create: (entity: new () => object, data: Record<string, unknown>) =>
      Object.assign(new entity(), data),
    save: async (...args: unknown[]) => {
      const value = args.length > 1 ? args[1] : args[0]
      saved.push(value)
      return value
    },
    count: async () => options?.activePositionCount ?? 0,
  }

  const positionRepository = {
    manager: {
      transaction: async (callback: (manager: unknown) => Promise<unknown>) =>
        callback(transactionalManager),
    },
    find: async () => positions,
  }

  const userRepository = {
    findOne: async () => user,
  }

  const idempotencyService = {
    run: async (
      _scope: string,
      _actorId: number,
      _key: string | string[] | undefined,
      handler: () => Promise<unknown>,
    ) => handler(),
  }

  const service = new EarnVaultService(
    positionRepository as never,
    userRepository as never,
    idempotencyService as never,
  )

  return { position, saved, service, user }
}

void (async () => {
  {
    const { saved, service, user } = makeHarness()

    const result = await service.createPosition(5, {
      plan_id: 'starter',
      amount: 10.23,
    })

    const savedPosition = saved.find(
      item => item instanceof EarnVaultPosition,
    ) as EarnVaultPosition | undefined

    assert.ok(savedPosition)
    assert.equal(savedPosition.amount, 10.23)
    assert.equal(savedPosition.reward_amount, 0.01)
    assert.equal(savedPosition.status, 'active')
    assert.equal(user.balance, 89.77)
    assert.equal(result.new_balance, 89.77)
  }

  {
    const { saved, service } = makeHarness()

    const result = await service.createPosition(5, {
      plan_id: 'flexible',
      amount: 25,
    })

    const savedPosition = saved.find(
      item => item instanceof EarnVaultPosition,
    ) as EarnVaultPosition | undefined

    assert.ok(savedPosition)
    assert.equal(savedPosition.plan_id, 'flexible')
    assert.equal(savedPosition.duration_days, 0)
    assert.equal(savedPosition.reward_amount, 0)
    assert.equal(result.position.can_claim, true)
    assert.equal(result.position.can_unstake, false)
  }

  {
    const { position, service, user } = makeHarness()
    position.ends_at = new Date(Date.now() - 1000)

    const result = await service.claimPosition(5, '10')

    assert.equal(position.status, 'claimed')
    assert.ok(position.claimed_at)
    assert.equal(user.balance, 110.35)
    assert.equal(result.new_balance, 110.35)
  }

  {
    const { position, service, user } = makeHarness()
    position.plan_id = 'flexible'
    position.plan_name = 'Flexible Vault'
    position.amount = 100
    position.reward_amount = 0
    position.rate_percent = 4
    position.duration_days = 0
    position.starts_at = new Date(Date.now() - 24 * 60 * 60 * 1000)
    position.ends_at = position.starts_at

    const result = await service.claimPosition(5, '10')
    const expectedReward = calculateEarnVaultAccruedReward(
      100,
      { ratePercent: 4 },
      position.starts_at,
    )

    assert.equal(position.status, 'claimed')
    assert.ok(position.claimed_at)
    assert.equal(position.reward_amount, expectedReward)
    assert.equal(user.balance, 200 + expectedReward)
    assert.equal(result.new_balance, 200 + expectedReward)
  }

  {
    const { position, service, user } = makeHarness()
    position.ends_at = new Date(Date.now() + 24 * 60 * 60 * 1000)

    const result = await service.unstakePosition(5, '10')

    assert.equal(position.status, 'cancelled')
    assert.ok(position.cancelled_at)
    assert.equal(user.balance, 110)
    assert.equal(result.new_balance, 110)
  }

  {
    const { service } = makeHarness()

    await assert.rejects(
      () => service.createPosition(5, { plan_id: 'starter', amount: 10.239 }),
      BadRequestException,
    )
  }

  {
    const { service } = makeHarness({
      activePositionCount: EARN_VAULT_ACTIVE_POSITION_LIMIT,
    })

    await assert.rejects(
      () => service.createPosition(5, { plan_id: 'starter', amount: 10 }),
      BadRequestException,
    )
  }

  {
    const manyPositions = Array.from(
      { length: EARN_VAULT_POSITION_LIST_LIMIT + 1 },
      (_, index) =>
        Object.assign(new EarnVaultPosition(), {
          id: String(index + 1),
          user_id: 5,
          plan_id: 'starter',
          plan_name: 'Starter Vault',
          status: 'active',
          amount: 1,
          reward_amount: 0.01,
          rate_percent: 7,
          duration_days: 7,
          starts_at: new Date('2026-05-01T00:00:00.000Z'),
          ends_at: new Date('2026-05-08T00:00:00.000Z'),
          claimed_at: null,
          cancelled_at: null,
          created_at: new Date(
            new Date('2026-05-01T00:00:00.000Z').getTime() + index,
          ),
          updated_at: new Date('2026-05-01T00:00:00.000Z'),
        }),
    )
    const { service } = makeHarness({ positions: manyPositions })

    const summary = await service.getSummary(5)

    assert.equal(summary.vault_balance, EARN_VAULT_POSITION_LIST_LIMIT + 1)
    assert.equal(summary.active_position_count, EARN_VAULT_POSITION_LIST_LIMIT + 1)
    assert.equal(summary.positions.length, EARN_VAULT_POSITION_LIST_LIMIT)
  }

  console.log('earn-vault.service.spec.ts passed')
})()
