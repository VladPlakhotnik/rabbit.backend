import assert from 'node:assert/strict'

import { PromoCodeService } from '../promoCodes/promoCode.service'
import {
  PromoCodeStatus,
  PromoCodeType,
} from '../promoCodes/entities/promoCode.entity'
import { RewardType as PromoRewardType } from '../promoCodes/entities/promoCodeReward.entity'
import { RewardsService } from '../rewards/rewards.service'
import { RewardType } from '../rewards/enums/reward-type.enum'

const createQueryBuilderMock = (items: unknown[], total: number) => {
  const calls: {
    andWhere: unknown[][]
    joins: unknown[][]
    orderBy: unknown[][]
    skip: unknown[]
    take: unknown[]
    where: unknown[][]
  } = {
    andWhere: [],
    joins: [],
    orderBy: [],
    skip: [],
    take: [],
    where: [],
  }

  const queryBuilder = {
    calls,
    andWhere: (...args: unknown[]) => {
      calls.andWhere.push(args)
      return queryBuilder
    },
    getManyAndCount: async () => [items, total] as const,
    leftJoinAndSelect: (...args: unknown[]) => {
      calls.joins.push(args)
      return queryBuilder
    },
    orderBy: (...args: unknown[]) => {
      calls.orderBy.push(args)
      return queryBuilder
    },
    skip: (value: unknown) => {
      calls.skip.push(value)
      return queryBuilder
    },
    take: (value: unknown) => {
      calls.take.push(value)
      return queryBuilder
    },
    where: (...args: unknown[]) => {
      calls.where.push(args)
      return queryBuilder
    },
  }

  return queryBuilder
}

const predicatesOf = (calls: { andWhere: unknown[][]; where: unknown[][] }) =>
  [...calls.where, ...calls.andWhere].map(call => String(call[0])).join('\n')

async function listsPromoCodesForAdminWithFilters() {
  const rows = [
    {
      code: 'WELCOME50',
      current_uses: 4,
      id: 1,
      max_uses: 100,
      status: PromoCodeStatus.ACTIVE,
      type: PromoCodeType.BONUS,
    },
  ]
  const queryBuilder = createQueryBuilderMock(rows, 13)
  const promoCodeRepository = {
    createQueryBuilder: () => queryBuilder,
  }
  const service = new PromoCodeService(
    promoCodeRepository as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  )

  const result = await service.findAllForAdmin({
    limit: 5,
    page: 2,
    rewardType: PromoRewardType.BALANCE,
    search: 'welcome',
    status: PromoCodeStatus.ACTIVE,
    type: PromoCodeType.BONUS,
  })

  const predicates = predicatesOf(queryBuilder.calls)

  assert.deepEqual(result.items, rows)
  assert.equal(result.total, 13)
  assert.equal(result.page, 2)
  assert.equal(result.limit, 5)
  assert.equal(result.hasMore, true)
  assert.equal(queryBuilder.calls.skip[0], 5)
  assert.equal(queryBuilder.calls.take[0], 5)
  assert.equal(queryBuilder.calls.joins.length >= 3, true)
  assert.match(predicates, /promo\.status = :status/)
  assert.match(predicates, /promo\.type = :type/)
  assert.match(predicates, /reward\.reward_type = :rewardType/)
  assert.match(predicates, /ILIKE :search/)
}

async function listsWheelRewardsForAdminWithFilters() {
  const rows = [
    {
      drop_chance: 2.5,
      id: 7,
      is_active: true,
      name: 'Carrot stack',
      type: RewardType.CARROTS,
      value: 1000,
    },
  ]
  const queryBuilder = createQueryBuilderMock(rows, 8)
  const rewardRepository = {
    createQueryBuilder: () => queryBuilder,
  }
  const service = new RewardsService(
    rewardRepository as never,
    {} as never,
    {} as never,
  )

  const result = await service.findAllForAdmin({
    active: true,
    game_type: 'csgo',
    limit: 4,
    page: 2,
    search: 'carrot',
    type: RewardType.CARROTS,
  })

  const predicates = predicatesOf(queryBuilder.calls)

  assert.deepEqual(result.items, rows)
  assert.equal(result.total, 8)
  assert.equal(result.page, 2)
  assert.equal(result.limit, 4)
  assert.equal(result.hasMore, false)
  assert.equal(queryBuilder.calls.skip[0], 4)
  assert.equal(queryBuilder.calls.take[0], 4)
  assert.equal(queryBuilder.calls.joins.length >= 3, true)
  assert.match(predicates, /reward\.is_active = :active/)
  assert.match(predicates, /reward\.type = :type/)
  assert.match(predicates, /reward\.game_type = :gameType/)
  assert.match(predicates, /ILIKE :search/)
}

async function run() {
  await listsPromoCodesForAdminWithFilters()
  await listsWheelRewardsForAdminWithFilters()
}

void run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
