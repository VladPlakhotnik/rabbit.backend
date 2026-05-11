import 'reflect-metadata'
import assert from 'node:assert/strict'

import { ClickerHistoryService } from './clicker-history.service'

const repo = {
  createQueryBuilder: () => queryBuilder,
}

const calls: unknown[][] = []
const queryBuilder = {
  where: (...args: unknown[]) => {
    calls.push(['where', ...args])
    return queryBuilder
  },
  orderBy: (...args: unknown[]) => {
    calls.push(['orderBy', ...args])
    return queryBuilder
  },
  skip: (...args: unknown[]) => {
    calls.push(['skip', ...args])
    return queryBuilder
  },
  take: (...args: unknown[]) => {
    calls.push(['take', ...args])
    return queryBuilder
  },
  getManyAndCount: async () => [[{ id: '9', action: 'grant_points' }], 11],
}

const run = async () => {
  const service = new ClickerHistoryService(repo as never)
  const result = await service.getUserHistory(7, {
    page: 2,
    limit: 10,
    skip: 10,
  })

  assert.equal(result.items.length, 1)
  assert.equal(result.total, 11)
  assert.equal(result.page, 2)
  assert.equal(result.totalPages, 2)
  assert.deepEqual(
    calls.find(call => call[0] === 'skip'),
    ['skip', 10],
  )
  assert.deepEqual(
    calls.find(call => call[0] === 'take'),
    ['take', 10],
  )
}

void run().then(() => {
  console.log('clicker-history.service.spec.ts passed')
})
