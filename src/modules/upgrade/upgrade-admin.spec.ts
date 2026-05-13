import assert from 'node:assert/strict'

import { UpgradeHistory } from '../userHistory/entities/upgrade-history.entity'
import { UpgradeService } from './upgrade.service'

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
      assert.equal(entity, UpgradeHistory)
      assert.equal(alias, 'upgrade')
      return queryBuilder
    },
  }

  return new UpgradeService(entityManager as never, {} as never, {} as never)
}

async function listsUpgradeAttemptsForAdminWithFilters() {
  const rows = [
    {
      chance: 40,
      cost: 10,
      created_at: new Date('2026-05-13T10:00:00Z'),
      game_type: 'csgo',
      id: 99,
      materials: null,
      mode: 'balance',
      new_rarity: 'Covert',
      old_rarity: 'balance',
      skin_id: 123,
      skin_name: 'AWP | Asiimov',
      skin_price: 25,
      success: true,
      user: {
        avatar: null,
        display_name: 'xpuf',
        id: 42,
      },
      user_id: 42,
    },
  ]
  const queryBuilder = createQueryBuilderMock(rows, 8)
  const service = createService(queryBuilder)

  const result = await service.findAllForAdmin({
    gameType: 'csgo',
    limit: 4,
    maxChance: 80,
    maxCost: 100,
    maxTargetPrice: 300,
    minChance: 10,
    minCost: 1,
    minTargetPrice: 20,
    mode: 'balance',
    page: 2,
    search: 'xpuf',
    success: true,
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
  assert.equal(result.items[0]?.id, 99)
  assert.equal(result.items[0]?.multiplier, 2.5)
  assert.equal(result.items[0]?.payout, 25)
  assert.equal(result.items[0]?.project_profit, -15)
  assert.equal(result.items[0]?.target.name, 'AWP | Asiimov')
  assert.equal(result.items[0]?.user.id, 42)
  assert.equal(queryBuilder.calls.joins.length, 1)
  assert.equal(queryBuilder.calls.skip[0], 4)
  assert.equal(queryBuilder.calls.take[0], 4)
  assert.match(predicates, /COALESCE\(upgrade\.success, false\) = :success/)
  assert.match(predicates, /upgrade\.mode = :mode/)
  assert.match(predicates, /upgrade\.game_type = :gameType/)
  assert.match(predicates, /upgrade\.user_id = :userId/)
  assert.match(predicates, /upgrade\.cost >= :minCost/)
  assert.match(predicates, /upgrade\.cost <= :maxCost/)
  assert.match(predicates, /COALESCE\(upgrade\.chance, 0\) >= :minChance/)
  assert.match(predicates, /COALESCE\(upgrade\.chance, 0\) <= :maxChance/)
  assert.match(
    predicates,
    /COALESCE\(upgrade\.skin_price, 0\) >= :minTargetPrice/,
  )
  assert.match(
    predicates,
    /COALESCE\(upgrade\.skin_price, 0\) <= :maxTargetPrice/,
  )
  assert.match(predicates, /ILIKE :search/)
}

function exposesUpgradeAdminSettings() {
  const service = new UpgradeService({} as never, {} as never, {} as never)
  const settings = service.getAdminSettings()

  assert.equal(settings.min_chance, 1)
  assert.equal(settings.max_chance, 80)
  assert.equal(settings.min_amount, 0.5)
  assert.equal(settings.max_amount, 5000)
  assert.equal(settings.house_return, 0.96)
  assert.deepEqual(settings.modes, ['balance', 'inventory'])
  assert.deepEqual(settings.game_types, ['csgo', 'dota'])
}

async function run() {
  exposesUpgradeAdminSettings()
  await listsUpgradeAttemptsForAdminWithFilters()
}

void run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
