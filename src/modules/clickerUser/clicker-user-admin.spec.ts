import assert from 'node:assert/strict'

import { ClickerUserService } from './clicker-user.service'

const createQueryBuilderMock = (items: unknown[], total: number) => {
  const calls: {
    andWhere: unknown[][]
    joins: unknown[][]
    orderBy: unknown[][]
    skip: unknown[]
    take: unknown[]
  } = {
    andWhere: [],
    joins: [],
    orderBy: [],
    skip: [],
    take: [],
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
  }

  return queryBuilder
}

const createService = (queryBuilder: ReturnType<typeof createQueryBuilderMock>) => {
  const repo = {
    createQueryBuilder: (alias: string) => {
      assert.equal(alias, 'clickerUser')
      return queryBuilder
    },
  }

  return new ClickerUserService(
    repo as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  )
}

async function listsClickerUsersWithServerSideSearch() {
  const rows = [{ id: 7, points: 1200, user_id: 42 }]
  const queryBuilder = createQueryBuilderMock(rows, 1)
  const service = createService(queryBuilder)

  const result = await service.findAll(2, 10, ' 42 ')
  const predicate = String(queryBuilder.calls.andWhere[0]?.[0] ?? '')
  const params = queryBuilder.calls.andWhere[0]?.[1] as { search?: string }

  assert.deepEqual(result.data, rows)
  assert.equal(result.total, 1)
  assert.equal(result.page, 2)
  assert.equal(result.limit, 10)
  assert.equal(queryBuilder.calls.skip[0], 10)
  assert.equal(queryBuilder.calls.take[0], 10)
  assert.equal(params.search, '%42%')
  assert.match(predicate, /clickerUser\.id/)
  assert.match(predicate, /clickerUser\.user_id/)
  assert.match(predicate, /clickerUser\.points/)
  assert.match(predicate, /ILIKE :search/)
  assert.equal(queryBuilder.calls.joins.length, 5)
}

async function skipsSearchPredicateForBlankSearch() {
  const queryBuilder = createQueryBuilderMock([], 0)
  const service = createService(queryBuilder)

  const result = await service.findAll(1, 20, '   ')

  assert.equal(result.total, 0)
  assert.equal(queryBuilder.calls.andWhere.length, 0)
}

async function run() {
  await listsClickerUsersWithServerSideSearch()
  await skipsSearchPredicateForBlankSearch()
}

void run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
