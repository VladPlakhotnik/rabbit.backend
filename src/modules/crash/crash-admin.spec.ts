import assert from 'node:assert/strict'

import { CrashSession } from './entities/crash-session.entity'
import { CrashService } from './crash.service'

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

const createService = (
  queryBuilder: ReturnType<typeof createQueryBuilderMock>,
) => {
  const entityManager = {
    createQueryBuilder: (entity: unknown, alias: string) => {
      assert.equal(entity, CrashSession)
      assert.equal(alias, 'session')
      return queryBuilder
    },
  }

  return new CrashService(
    entityManager as never,
    {} as never,
    { getSnapshot: () => ({ participantCount: 0 }) } as never,
  )
}

async function listsCrashSessionsForAdminWithFilters() {
  const rows = [
    {
      cashout_multiplier: 2.5,
      created_at: new Date('2026-05-13T10:00:00Z'),
      id: 77,
      mfr_algorithm: 'MFR_MATH_RANDOM',
      mfr_seed_hash: 'seed-hash',
      slot: 1,
      stake_amount: 10,
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
      win_amount: 25,
    },
  ]
  const queryBuilder = createQueryBuilderMock(rows, 9)
  const service = createService(queryBuilder)

  const result = await service.findAllForAdmin({
    limit: 5,
    maxMultiplier: 5,
    maxStake: 100,
    maxWin: 200,
    minMultiplier: 1.1,
    minStake: 1,
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
  assert.equal(result.items[0]?.profit, 15)
  assert.equal(result.items[0]?.user.id, 42)
  assert.equal(result.items[0]?.cashout_multiplier, 2.5)
  assert.equal(queryBuilder.calls.joins.length, 1)
  assert.equal(queryBuilder.calls.skip[0], 5)
  assert.equal(queryBuilder.calls.take[0], 5)
  assert.match(predicates, /session\.status = :status/)
  assert.match(predicates, /session\.stake_mode = :stakeMode/)
  assert.match(predicates, /session\.user_id = :userId/)
  assert.match(predicates, /session\.stake_amount >= :minStake/)
  assert.match(predicates, /session\.stake_amount <= :maxStake/)
  assert.match(predicates, /COALESCE\(session\.win_amount, 0\) >= :minWin/)
  assert.match(predicates, /COALESCE\(session\.win_amount, 0\) <= :maxWin/)
  assert.match(
    predicates,
    /COALESCE\(session\.cashout_multiplier, 0\) >= :minMultiplier/,
  )
  assert.match(
    predicates,
    /COALESCE\(session\.cashout_multiplier, 0\) <= :maxMultiplier/,
  )
  assert.match(predicates, /ILIKE :search/)
}

function exposesCrashAdminSettings() {
  const service = new CrashService({} as never, {} as never, {} as never)
  const settings = service.getAdminSettings()

  assert.equal(settings.algorithm, 'MFR_MATH_RANDOM')
  assert.equal(settings.house_edge_bps, 300)
  assert.equal(settings.max_bet_amount, 5000)
  assert.equal(settings.max_bet_count, 2)
  assert.equal(settings.min_bet_amount, 0.5)
  assert.deepEqual(settings.stake_modes, ['balance', 'inventory'])
}

function exposesCrashLiveSnapshotForAdmin() {
  const snapshot = {
    countdownMs: 1500,
    crashPoint: null,
    currentMultiplier: 1.42,
    participantCount: 1,
    participants: [
      {
        avatar: null,
        id: 'bot-1',
        mode: 'balance',
        owner: 'bot',
        payout: 0,
        playerName: 'Bot',
        profit: 0,
        slot: 1,
        stake: 10,
        status: 'active',
        targetMultiplier: 2,
        userId: 1001,
      },
    ],
    phase: 'running',
    pot: 10,
    roundHistory: [1.1, 2.2],
    roundId: 12,
    serverTime: 1_778_688_000_000,
  }
  const service = new CrashService(
    {} as never,
    {} as never,
    { getSnapshot: () => snapshot } as never,
  )

  assert.deepEqual(service.getAdminLiveSnapshot(), snapshot)
}

async function run() {
  exposesCrashAdminSettings()
  exposesCrashLiveSnapshotForAdmin()
  await listsCrashSessionsForAdminWithFilters()
}

void run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
