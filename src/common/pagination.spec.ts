import assert from 'node:assert/strict'

import { buildPaginatedResponse, normalizePagination } from './pagination'

const first = normalizePagination({ page: 0, limit: 1000 })
assert.deepEqual(first, { page: 1, limit: 50, skip: 0 })

const second = normalizePagination({ page: 3, limit: 10 })
assert.deepEqual(second, { page: 3, limit: 10, skip: 20 })

assert.deepEqual(buildPaginatedResponse(['a', 'b'], 22, second), {
  items: ['a', 'b'],
  total: 22,
  page: 3,
  limit: 10,
  totalPages: 3,
})

console.log('pagination.spec.ts passed')
