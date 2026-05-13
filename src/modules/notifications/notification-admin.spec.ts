import 'reflect-metadata'
import assert from 'node:assert/strict'

import { getMetadataArgsStorage } from 'typeorm'
import { NotificationService } from './notification.service'
import { Notification } from './entities/notification.entity'

const createQueryBuilderMock = (items: unknown[], total: number) => {
  const calls: {
    andWhere: unknown[][]
    orderBy: unknown[][]
    skip: unknown[]
    take: unknown[]
    where: unknown[][]
  } = {
    andWhere: [],
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

async function createsGlobalNotificationsWithNullTarget() {
  const saved: unknown[] = []
  const notificationRepository = {
    create: (value: unknown) => value,
    save: async (value: unknown) => {
      saved.push(value)
      return value
    },
  }
  const service = new NotificationService(
    notificationRepository as never,
    {} as never,
    {} as never,
  )

  await service.create({ title: 'System', message: 'Maintenance' })

  assert.equal(
    (saved[0] as { user_id?: number | null }).user_id,
    null,
    'global notifications must persist user_id as null',
  )
}

async function listsNotificationsForAdminWithFilters() {
  const rows = [
    {
      created_at: new Date('2026-05-13T10:00:00Z'),
      id: 10,
      i18n_key: 'deposit.completed',
      is_important: true,
      is_viewed: false,
      message: null,
      title: null,
      user_id: null,
    },
  ]
  const queryBuilder = createQueryBuilderMock(rows, 7)
  const notificationRepository = {
    createQueryBuilder: () => queryBuilder,
  }
  const service = new NotificationService(
    notificationRepository as never,
    {} as never,
    {} as never,
  )

  const result = await service.findAllForAdmin({
    i18nKey: 'deposit.completed',
    important: true,
    limit: 3,
    page: 2,
    search: 'deposit',
    target: 'global',
    userId: 42,
    viewed: false,
  })

  const allPredicates = [
    ...queryBuilder.calls.where,
    ...queryBuilder.calls.andWhere,
  ]
    .map(call => String(call[0]))
    .join('\n')

  assert.deepEqual(result.items, rows)
  assert.equal(result.total, 7)
  assert.equal(result.page, 2)
  assert.equal(result.limit, 3)
  assert.equal(result.hasMore, true)
  assert.equal(queryBuilder.calls.skip[0], 3)
  assert.equal(queryBuilder.calls.take[0], 3)
  assert.match(allPredicates, /notification\.user_id IS NULL/)
  assert.match(allPredicates, /notification\.user_id = :userId/)
  assert.match(allPredicates, /notification\.i18n_key = :i18nKey/)
  assert.match(allPredicates, /notification\.is_important = :important/)
  assert.match(allPredicates, /notification\.is_viewed = :viewed/)
  assert.match(allPredicates, /ILIKE :search/)
}

function declaresNullableUserIdAsInteger() {
  const column = getMetadataArgsStorage().columns.find(
    entry => entry.target === Notification && entry.propertyName === 'user_id',
  )

  assert.equal(column?.options.nullable, true)
  assert.equal(column?.options.type, 'integer')
}

async function run() {
  declaresNullableUserIdAsInteger()
  await createsGlobalNotificationsWithNullTarget()
  await listsNotificationsForAdminWithFilters()
}

void run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
