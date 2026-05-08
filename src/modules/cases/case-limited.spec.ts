import 'reflect-metadata'
import assert from 'node:assert/strict'

import { BadRequestException } from '@nestjs/common'
import { CaseService } from './case.service'

const skin = (id: number, marketPrice: number) => ({
  id,
  name: `Skin ${id}`,
  market_hash_name: `Skin ${id}`,
  image: `skin-${id}.png`,
  market_price: marketPrice,
  quality: 'classified',
  name_color: null,
  background_color: null,
})

const skinCase = (id: number, chance: number, marketPrice: number) => ({
  id,
  chance,
  is_drop_out: true,
  skin_hash_name: `Skin ${id}`,
  skin: skin(id, marketPrice),
})

const createQueryBuilderMock = (affected: number) => {
  const calls: {
    set: unknown[]
    where: unknown[][]
    andWhere: unknown[][]
  } = {
    set: [],
    where: [],
    andWhere: [],
  }

  const queryBuilder = {
    calls,
    update: () => queryBuilder,
    set: (value: unknown) => {
      calls.set.push(value)
      return queryBuilder
    },
    where: (...args: unknown[]) => {
      calls.where.push(args)
      return queryBuilder
    },
    andWhere: (...args: unknown[]) => {
      calls.andWhere.push(args)
      return queryBuilder
    },
    returning: () => queryBuilder,
    execute: async () => ({ affected }),
  }

  return queryBuilder
}

const createService = (reserveAffected = 1) => {
  const caseEntity = {
    id: 7,
    slug: 'limited-case',
    name: 'Limited Case',
    case_price: 10,
    img_url: 'case.png',
    game_type: 'csgo',
    is_available: true,
    is_limited: true,
    remaining_count: 3,
    max_count: 10,
  }
  const queryBuilder = createQueryBuilderMock(reserveAffected)
  const caseRepository = {
    findOne: async () => caseEntity,
    createQueryBuilder: () => queryBuilder,
    incrementCalls: [] as unknown[],
    increment: async (...args: unknown[]) => {
      caseRepository.incrementCalls.push(args)
    },
  }
  const userService = {
    validateAndDeductBalanceCalls: [] as unknown[][],
    validateAndDeductBalance: async (...args: unknown[]) => {
      userService.validateAndDeductBalanceCalls.push(args)
    },
    findById: async () => ({ id: 42, display_name: 'CaseUser', avatar: null }),
  }
  const provablyFairService = {
    generateSeed: async () => ({ id: 900, server_seed: 'server-seed' }),
    generateRandomNumber: () => 0.25,
    markSeedAsUsed: async () => undefined,
  }
  const userInventoryService = {
    createInventory: async () => ({
      id: 100,
      obtained_at: new Date().toISOString(),
      is_sold: false,
      is_withdrawn: false,
      withdrawn_at: null,
    }),
  }
  const service = new CaseService(
    caseRepository as never,
    {} as never,
    { find: async () => [skinCase(1, 50, 5), skinCase(2, 50, 12)] } as never,
    {} as never,
    {} as never,
    userService as never,
    provablyFairService as never,
    userInventoryService as never,
    { openCase: async () => undefined } as never,
    { pushDrop: async () => undefined } as never,
    { trackEvent: async () => undefined } as never,
  )

  return { service, caseRepository, queryBuilder, userService }
}

const run = async () => {
  {
    const { service, queryBuilder } = createService(1)

    await service.openCase(7, 42, 2)

    assert.equal(queryBuilder.calls.set.length, 1)
    const setArg = queryBuilder.calls.set[0] as {
      remaining_count?: () => string
    }
    assert.equal(setArg.remaining_count?.(), 'remaining_count - :count')
    assert.ok(
      queryBuilder.calls.andWhere.some(([condition]) =>
        String(condition).includes('remaining_count >= :count'),
      ),
    )
  }

  {
    const { service, userService } = createService(0)

    await assert.rejects(() => service.openCase(7, 42, 4), BadRequestException)
    assert.equal(userService.validateAndDeductBalanceCalls.length, 0)
  }
}

void run().then(() => {
  console.log('case-limited.spec.ts passed')
})
