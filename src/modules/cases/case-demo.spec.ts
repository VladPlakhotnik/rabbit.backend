import 'reflect-metadata'
import assert from 'node:assert/strict'

import { CaseController } from './case.controller'
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

const createService = () => {
  const caseEntity = {
    id: 7,
    slug: 'demo-case',
    name: 'Demo Case',
    case_price: 10,
    img_url: 'case.png',
    game_type: 'csgo',
    is_available: true,
    is_limited: true,
    remaining_count: 1,
    max_count: 10,
  }
  const sideEffects = {
    reserveCalls: 0,
    balanceCalls: 0,
    inventoryCalls: 0,
    historyCalls: 0,
    liveDropCalls: 0,
    seedCalls: 0,
    usedSeedCalls: 0,
    challengeCalls: 0,
  }
  const caseRepository = {
    findOne: async () => caseEntity,
    createQueryBuilder: () => {
      sideEffects.reserveCalls += 1
      throw new Error('demo open must not reserve limited copies')
    },
  }
  const userService = {
    validateAndDeductBalance: async () => {
      sideEffects.balanceCalls += 1
    },
    findById: async () => ({ id: 42, display_name: 'CaseUser', avatar: null }),
  }
  const provablyFairService = {
    generateSeed: async () => {
      sideEffects.seedCalls += 1
      return { id: 900, server_seed: 'server-seed' }
    },
    generateRandomNumber: () => 0.25,
    markSeedAsUsed: async () => {
      sideEffects.usedSeedCalls += 1
    },
  }
  const userInventoryService = {
    createInventory: async () => {
      sideEffects.inventoryCalls += 1
      return { id: 100 }
    },
  }
  const userHistoryService = {
    openCase: async () => {
      sideEffects.historyCalls += 1
    },
  }
  const liveDropsService = {
    pushDrop: async () => {
      sideEffects.liveDropCalls += 1
    },
  }
  const clickerChallengesService = {
    trackEvent: async () => {
      sideEffects.challengeCalls += 1
    },
  }
  const service = new CaseService(
    caseRepository as never,
    {} as never,
    { find: async () => [skinCase(1, 100, 12)] } as never,
    {} as never,
    {} as never,
    userService as never,
    provablyFairService as never,
    userInventoryService as never,
    userHistoryService as never,
    liveDropsService as never,
    clickerChallengesService as never,
  )

  return { service, sideEffects }
}

const run = async () => {
  {
    const { service, sideEffects } = createService()

    const result = await service.openDemoCase(7, 2)

    assert.equal(result.results.length, 2)
    assert.equal(result.totalCost, 20)
    assert.equal(result.results[0]?.winner.skin.market_hash_name, 'Skin 1')
    assert.ok(result.results[0]?.inventory.id < 0)
    assert.deepEqual(sideEffects, {
      reserveCalls: 0,
      balanceCalls: 0,
      inventoryCalls: 0,
      historyCalls: 0,
      liveDropCalls: 0,
      seedCalls: 0,
      usedSeedCalls: 0,
      challengeCalls: 0,
    })
  }

  {
    const calls: unknown[][] = []
    const controller = new CaseController({
      findBySlug: async (slug: string) => ({ id: 9, slug }),
      openDemoCase: async (...args: unknown[]) => {
        calls.push(args)
        return { results: [], game_id: 0, totalCost: 30 }
      },
    } as never)

    const result = await controller.openDemoCaseBySlug('demo-case', 3)

    assert.deepEqual(calls, [[9, 3]])
    assert.equal(result.totalCost, 30)
  }
}

void run().then(() => {
  console.log('case-demo.spec.ts passed')
})
