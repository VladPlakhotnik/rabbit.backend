import 'reflect-metadata'
import assert from 'node:assert/strict'

import { BonusType, UserBonus } from './userBonus.entity'
import { UserBonusService } from './userBonus.service'
import { RewardType } from '../rewards/enums/reward-type.enum'
import { RewardsCooldown } from '../rewards/entities/rewardsCooldown.entity'
import { User } from '../users/user.entity'

const makeManager = () => {
  const saved: unknown[] = []
  const clickerGrants: Array<{ userId: number; amount: number }> = []
  const findOneCalls: Array<{ entity: unknown; options: Record<string, unknown> }> = []
  const user = Object.assign(new User(), {
    id: 7,
    balance: 12,
  })
  const bonus = {
    id: 44,
    user_id: 7,
    bonus_type: BonusType.WHEEL,
    reward_id: 3,
    promo_code_id: null,
    is_claimed: false,
    expired_at: new Date(Date.now() + 60_000),
    reward: {
      id: 3,
      type: RewardType.BALANCE,
      name: 'Balance top-up',
      value: 5,
    },
    promoCode: null,
  }

  const manager = {
    transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(transactionalManager),
  }

  const transactionalManager = {
    findOne: async (entity: unknown, options: Record<string, unknown> = {}) => {
      findOneCalls.push({ entity, options })
      if (entity === UserBonus && options.lock && options.relations) {
        throw new Error('unsafe relation lock')
      }
      if (entity === UserBonus) return bonus
      if (entity === User) return user
      if (entity === RewardsCooldown) {
        return Object.assign(new RewardsCooldown(), {
          id: 10,
          user: { id: 7 },
          last_spin: new Date('2026-01-01T00:00:00.000Z'),
          next_available: new Date('2026-01-03T00:00:00.000Z'),
        })
      }
      return null
    },
    save: async (...args: unknown[]) => {
      const value = args.length > 1 ? args[1] : args[0]
      saved.push(value)
      return value
    },
  }

  const repository = {
    manager,
    findOne: async () => bonus,
    save: async (value: unknown) => {
      saved.push(value)
      return value
    },
  }

  const service = new UserBonusService(
    repository as never,
    {
      grantWheelRewardPoints: async (userId: number, amount: number) => {
        clickerGrants.push({ userId, amount })
        return { user_id: userId, points: amount, level_id: 1 }
      },
    } as never,
    {
      createInventoryFromReward: async () => ({ id: 1 }),
    } as never,
    {
      openFreeCase: async () => ({ results: [], totalCost: 0 }),
    } as never,
  )

  return { bonus, clickerGrants, findOneCalls, saved, service, user }
}

void (async () => {
  {
    const { bonus, service, user } = makeManager()

    const result = await service.claimBonus(bonus.id, user.id)

    assert.equal(user.balance, 17)
    assert.equal(bonus.is_claimed, true)
    assert.equal(result.id, bonus.id)
  }

  {
    const { bonus, saved, service, user } = makeManager()
    bonus.reward.type = RewardType.RESPIN
    bonus.reward.value = 0

    await service.claimBonus(bonus.id, user.id)

    const savedCooldown = saved.find(
      value => value instanceof RewardsCooldown,
    ) as RewardsCooldown | undefined
    assert.ok(savedCooldown)
    assert.ok(savedCooldown.next_available.getTime() <= Date.now())
  }

  {
    const { bonus, findOneCalls, service, user } = makeManager()
    bonus.reward.type = RewardType.CODE
    bonus.reward.value = 5

    await service.claimBonus(bonus.id, user.id)

    const lockedBonusLookup = findOneCalls.find(
      call => call.entity === UserBonus && call.options.lock,
    )
    assert.ok(lockedBonusLookup)
    assert.equal(lockedBonusLookup.options.relations, undefined)
    assert.equal(bonus.is_claimed, true)
  }

  {
    const { bonus, clickerGrants, service, user } = makeManager()
    bonus.reward.type = RewardType.CARROTS
    bonus.reward.value = 1000

    await service.claimBonus(bonus.id, user.id)

    assert.deepEqual(clickerGrants, [{ userId: user.id, amount: 1000 }])
    assert.equal(bonus.is_claimed, true)
  }

  console.log('userBonus.service.spec.ts passed')
})()
