import assert from 'node:assert/strict'

import { WithdrawService } from './withdraw.service'
import { WithdrawalStatus } from './withdrawal.entity'

const createListQueryBuilderMock = (items: unknown[], total: number) => {
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

const createOverviewQueryBuilderMock = (raw: Record<string, unknown>) => {
  const calls: { addSelect: unknown[][]; select: unknown[][] } = {
    addSelect: [],
    select: [],
  }

  const queryBuilder = {
    calls,
    addSelect: (...args: unknown[]) => {
      calls.addSelect.push(args)
      return queryBuilder
    },
    getRawOne: async () => raw,
    select: (...args: unknown[]) => {
      calls.select.push(args)
      return queryBuilder
    },
  }

  return queryBuilder
}

const createService = (withdrawalRepository: unknown) =>
  new WithdrawService(
    withdrawalRepository as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  )

async function listsWithdrawalsForAdminWithFilters() {
  const rows = [
    {
      actual_price: 23,
      completed_at: null,
      created_at: new Date('2026-05-13T10:00:00Z'),
      custom_id: 'wd_test',
      failure_reason: null,
      game_type: 'csgo',
      id: 91,
      inventoryItem: {
        csgoSkin: {
          id: 123,
          image: 'skin.png',
          market_hash_name: 'AK-47 | Redline',
          market_price: 30,
          name: 'Redline',
          quality: 'Classified',
        },
        dotaSkin: null,
        game_type: 'csgo',
        id: 77,
      },
      inventory_item_id: 77,
      status: 'delivering',
      target_price: 25,
      tm_order_id: 'tm_1',
      trade_url: 'https://steamcommunity.com/tradeoffer/new/?partner=1&token=x',
      updated_at: new Date('2026-05-13T10:01:00Z'),
      user: {
        avatar: null,
        display_name: 'xpuf',
        id: 42,
      },
      user_id: 42,
    },
  ]
  const queryBuilder = createListQueryBuilderMock(rows, 8)
  const service = createService({
    createQueryBuilder: () => queryBuilder,
  })

  const result = await service.findAllForAdmin({
    gameType: 'csgo',
    inventoryItemId: 77,
    limit: 4,
    maxActualPrice: 50,
    maxTargetPrice: 60,
    minActualPrice: 1,
    minTargetPrice: 2,
    page: 2,
    search: 'redline',
    status: WithdrawalStatus.Delivering,
    userId: 42,
  })

  const predicates = [
    ...queryBuilder.calls.where,
    ...queryBuilder.calls.andWhere,
  ]
    .map(call => String(call[0]))
    .join('\n')

  assert.equal(result.total, 8)
  assert.equal(result.page, 2)
  assert.equal(result.limit, 4)
  assert.equal(result.totalPages, 2)
  assert.equal(result.items[0]?.id, 91)
  assert.equal(result.items[0]?.skin?.name, 'AK-47 | Redline')
  assert.equal(result.items[0]?.user?.id, 42)
  assert.equal(queryBuilder.calls.joins.length, 4)
  assert.equal(queryBuilder.calls.skip[0], 4)
  assert.equal(queryBuilder.calls.take[0], 4)
  assert.match(predicates, /withdrawal\.status = :status/)
  assert.match(predicates, /withdrawal\.game_type = :gameType/)
  assert.match(predicates, /withdrawal\.user_id = :userId/)
  assert.match(predicates, /withdrawal\.inventory_item_id = :inventoryItemId/)
  assert.match(predicates, /withdrawal\.target_price >= :minTargetPrice/)
  assert.match(predicates, /withdrawal\.target_price <= :maxTargetPrice/)
  assert.match(predicates, /COALESCE\(withdrawal\.actual_price, 0\) >= :minActualPrice/)
  assert.match(predicates, /COALESCE\(withdrawal\.actual_price, 0\) <= :maxActualPrice/)
  assert.match(predicates, /ILIKE :search/)
}

async function exposesWithdrawalAdminOverview() {
  const queryBuilder = createOverviewQueryBuilderMock({
    completed_count: '7',
    csgo_count: '8',
    delivering_count: '1',
    dota_count: '2',
    failed_count: '2',
    pending_count: '1',
    purchasing_count: '2',
    total_actual_price: '340.5',
    total_count: '10',
    total_target_price: '480.75',
  })
  const service = createService({
    createQueryBuilder: () => queryBuilder,
  })

  const overview = await service.getAdminOverview()

  assert.equal(overview.total, 10)
  assert.equal(overview.inFlight, 4)
  assert.equal(overview.completed, 7)
  assert.equal(overview.failed, 2)
  assert.equal(overview.byGame.csgo, 8)
  assert.equal(overview.byGame.dota, 2)
  assert.equal(overview.amount.target, 480.75)
  assert.equal(overview.amount.actual, 340.5)
  assert.ok(queryBuilder.calls.select.length > 0)
}

async function run() {
  await exposesWithdrawalAdminOverview()
  await listsWithdrawalsForAdminWithFilters()
}

void run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
