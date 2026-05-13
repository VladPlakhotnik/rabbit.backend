import assert from 'node:assert/strict'

import { BadRequestException } from '@nestjs/common'
import { NewsService } from './news.service'

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

async function listsNewsForAdminWithFilters() {
  const rows = [
    {
      category: 'Updates',
      id: 7,
      preview_image: 'https://cdn.example/news.png',
      slug: 'case-update',
      title: 'Case update',
    },
  ]
  const queryBuilder = createQueryBuilderMock(rows, 11)
  const newsRepository = {
    createQueryBuilder: () => queryBuilder,
  }
  const service = new NewsService(newsRepository as never)

  const result = await service.findAllForAdmin({
    category: 'Updates',
    limit: 5,
    page: 2,
    search: 'case',
  })

  const predicates = [
    ...queryBuilder.calls.where,
    ...queryBuilder.calls.andWhere,
  ]
    .map(call => String(call[0]))
    .join('\n')

  assert.deepEqual(result.items, rows)
  assert.equal(result.total, 11)
  assert.equal(result.page, 2)
  assert.equal(result.limit, 5)
  assert.equal(result.hasMore, true)
  assert.equal(queryBuilder.calls.skip[0], 5)
  assert.equal(queryBuilder.calls.take[0], 5)
  assert.match(predicates, /news\.category = :category/)
  assert.match(predicates, /ILIKE :search/)
}

async function createsNewsWithNormalizedContentBlocks() {
  const saved: unknown[] = []
  const newsRepository = {
    create: (value: unknown) => value,
    findOne: async () => null,
    save: async (value: unknown) => {
      saved.push(value)
      return { id: 1, ...(value as Record<string, unknown>) }
    },
  }
  const service = new NewsService(newsRepository as never)

  const result = await service.createAdmin({
    category: ' Updates ',
    content: [
      { content: ' Main title ', type: 'title' },
      { content: ' One\nTwo ', type: 'list' },
      { alt: ' Preview ', type: 'image', url: ' https://cdn.example/a.png ' },
    ],
    preview_image: ' https://cdn.example/preview.png ',
    slug: ' case-update ',
    title: ' Case update ',
  })

  assert.equal(result.id, 1)
  assert.equal((saved[0] as { slug: string }).slug, 'case-update')
  assert.equal((saved[0] as { title: string }).title, 'Case update')
  assert.equal((saved[0] as { category: string }).category, 'Updates')
  assert.deepEqual((saved[0] as { content: unknown[] }).content, [
    { content: 'Main title', type: 'title' },
    { content: 'One\nTwo', type: 'list' },
    { alt: 'Preview', type: 'image', url: 'https://cdn.example/a.png' },
  ])
}

async function rejectsImageBlocksWithoutUrl() {
  const service = new NewsService({} as never)

  await assert.rejects(
    () =>
      service.createAdmin({
        category: 'Updates',
        content: [{ alt: 'Missing URL', type: 'image' }],
        preview_image: 'https://cdn.example/preview.png',
        slug: 'case-update',
        title: 'Case update',
      }),
    BadRequestException,
  )
}

async function run() {
  await listsNewsForAdminWithFilters()
  await createsNewsWithNormalizedContentBlocks()
  await rejectsImageBlocksWithoutUrl()
}

void run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
