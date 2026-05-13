import assert from 'node:assert/strict'

import { UserDepositStatus } from './user-deposit.entity'
import { UserService } from './users.service'

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

const createService = (depositRepository: unknown) =>
  new UserService(
    {} as never,
    depositRepository as never,
    {} as never,
    {} as never,
    { del: async () => undefined } as never,
  )

async function listsDepositsForAdminWithFilters() {
  const rows = [
    {
      amount: 125.5,
      bonus_amount: 12.5,
      created_at: new Date('2026-05-13T10:00:00Z'),
      external_id: 'pi_test_1',
      failure_reason: null,
      id: 17,
      source: 'stripe',
      status: 'success',
      updated_at: new Date('2026-05-13T10:01:00Z'),
      user: {
        avatar: null,
        display_name: 'xpuf',
        id: 42,
      },
      user_id: 42,
    },
  ]
  const queryBuilder = createListQueryBuilderMock(rows, 6)
  const service = createService({
    createQueryBuilder: () => queryBuilder,
  })

  const result = await service.findDepositsForAdmin({
    limit: 3,
    maxAmount: 300,
    minAmount: 10,
    page: 2,
    search: 'stripe',
    source: 'stripe',
    status: UserDepositStatus.SUCCESS,
    userId: 42,
  })

  const predicates = [
    ...queryBuilder.calls.where,
    ...queryBuilder.calls.andWhere,
  ]
    .map(call => String(call[0]))
    .join('\n')

  assert.equal(result.total, 6)
  assert.equal(result.page, 2)
  assert.equal(result.limit, 3)
  assert.equal(result.totalPages, 2)
  assert.equal(result.items[0]?.id, 17)
  assert.equal(result.items[0]?.method, 'stripe')
  assert.equal(result.items[0]?.user?.id, 42)
  assert.equal(queryBuilder.calls.joins.length, 1)
  assert.equal(queryBuilder.calls.skip[0], 3)
  assert.equal(queryBuilder.calls.take[0], 3)
  assert.match(predicates, /deposit\.status = :status/)
  assert.match(predicates, /deposit\.source = :source/)
  assert.match(predicates, /deposit\.user_id = :userId/)
  assert.match(predicates, /deposit\.amount >= :minAmount/)
  assert.match(predicates, /deposit\.amount <= :maxAmount/)
  assert.match(predicates, /ILIKE :search/)
}

async function exposesDepositAdminOverview() {
  const queryBuilder = createOverviewQueryBuilderMock({
    cancelled_count: '1',
    error_count: '2',
    success_amount: '500.25',
    success_bonus_amount: '35.5',
    success_count: '4',
    total_amount: '700.75',
    total_count: '9',
    waiting_amount: '200.5',
    waiting_count: '2',
  })
  const service = createService({
    createQueryBuilder: () => queryBuilder,
  })

  const overview = await service.getDepositsAdminOverview()

  assert.equal(overview.total, 9)
  assert.equal(overview.waiting, 2)
  assert.equal(overview.success, 4)
  assert.equal(overview.error, 2)
  assert.equal(overview.cancelled, 1)
  assert.equal(overview.amount.total, 700.75)
  assert.equal(overview.amount.waiting, 200.5)
  assert.equal(overview.amount.success, 500.25)
  assert.equal(overview.bonus.success, 35.5)
  assert.ok(queryBuilder.calls.select.length > 0)
}

async function run() {
  await exposesDepositAdminOverview()
  await listsDepositsForAdminWithFilters()
}

void run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
