import assert from 'node:assert/strict'

import { MinesSession } from './entities/mines-session.entity'
import { MinesService } from './mines.service'

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

const createService = (queryBuilder: ReturnType<typeof createQueryBuilderMock>) => {
  const entityManager = {
    createQueryBuilder: (entity: unknown, alias: string) => {
      assert.equal(entity, MinesSession)
      assert.equal(alias, 'session')
      return queryBuilder
    },
  }

  return new MinesService(entityManager as never, {} as never, {} as never)
}

async function listsMinesSessionsForAdminWithFilters() {
  const rows = [
    {
      bet_amount: 10,
      board_size: 25,
      created_at: new Date('2026-05-13T10:00:00Z'),
      current_multiplier: 2,
      id: 77,
      mine_positions: [1, 5, 9],
      mines_count: 3,
      mfr_algorithm: 'MFR_CRYPTO_RANDOM_INT',
      mfr_seed_hash: 'seed-hash',
      revealed_cells: [0, 2],
      stake_items: null,
      stake_mode: 'balance',
      status: 'cashed_out',
      updated_at: new Date('2026-05-13T10:01:00Z'),
      user: {
        avatar: null,
        display_name: 'xpuf',
        id: 42,
      },
      user_id: 42,
      win_amount: 20,
    },
  ]
  const queryBuilder = createQueryBuilderMock(rows, 9)
  const service = createService(queryBuilder)

  const result = await service.findAllForAdmin({
    limit: 5,
    maxBet: 100,
    maxMines: 10,
    maxWin: 200,
    minBet: 1,
    minMines: 2,
    minWin: 0,
    page: 2,
    search: 'xpuf',
    stakeMode: 'balance',
    status: 'cashed_out',
    userId: 42,
  })

  const predicates = [
    ...queryBuilder.calls.where,
    ...queryBuilder.calls.andWhere,
  ]
    .map(call => String(call[0]))
    .join('\n')

  assert.equal(result.total, 9)
  assert.equal(result.page, 2)
  assert.equal(result.limit, 5)
  assert.equal(result.totalPages, 2)
  assert.equal(result.items[0]?.game_session_id, 77)
  assert.equal(result.items[0]?.profit, 10)
  assert.equal(result.items[0]?.safe_reveals, 2)
  assert.equal(result.items[0]?.user?.id, 42)
  assert.deepEqual(result.items[0]?.mine_cells, [1, 5, 9])
  assert.equal(queryBuilder.calls.joins.length, 1)
  assert.equal(queryBuilder.calls.skip[0], 5)
  assert.equal(queryBuilder.calls.take[0], 5)
  assert.match(predicates, /session\.status = :status/)
  assert.match(predicates, /session\.stake_mode = :stakeMode/)
  assert.match(predicates, /session\.user_id = :userId/)
  assert.match(predicates, /session\.bet_amount >= :minBet/)
  assert.match(predicates, /session\.bet_amount <= :maxBet/)
  assert.match(predicates, /COALESCE\(session\.win_amount, 0\) >= :minWin/)
  assert.match(predicates, /COALESCE\(session\.win_amount, 0\) <= :maxWin/)
  assert.match(predicates, /session\.mines_count >= :minMines/)
  assert.match(predicates, /session\.mines_count <= :maxMines/)
  assert.match(predicates, /ILIKE :search/)
}

function exposesMinesAdminSettings() {
  const service = new MinesService({} as never, {} as never, {} as never)
  const settings = service.getAdminSettings()

  assert.equal(settings.board_size, 25)
  assert.equal(settings.grid_size, 5)
  assert.equal(settings.min_mines, 2)
  assert.equal(settings.max_mines, 20)
  assert.equal(settings.min_bet_amount, 0.5)
  assert.equal(settings.max_bet_amount, 5000)
  assert.equal(settings.house_return, 0.96)
  assert.deepEqual(settings.stake_modes, ['balance', 'inventory'])
}

async function run() {
  exposesMinesAdminSettings()
  await listsMinesSessionsForAdminWithFilters()
}

void run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
