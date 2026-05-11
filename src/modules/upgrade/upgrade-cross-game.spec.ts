import 'reflect-metadata'
import assert from 'node:assert/strict'

import { DotaSkin } from '../skins/dota-skin.entity'
import { User } from '../users/user.entity'
import { UpgradeService } from './upgrade.service'

const user = { id: 1, balance: 500 }
const targetDotaSkin = {
  id: 42,
  market_hash_name: 'Inscribed Pale Augur',
  market_price: 200,
  quality: null,
  rarity: 'Immortal',
}
const sourceCsgoSkin = {
  id: 42,
  market_hash_name: 'AK-47 | Redline',
  market_price: 100,
  quality: 'Classified',
}
const sourceInventoryItem = {
  id: 7,
  game_type: 'csgo',
  skin: sourceCsgoSkin,
}

let savedUpgradeHistory: any = null

const queryBuilder = {
  leftJoinAndSelect: () => queryBuilder,
  where: () => queryBuilder,
  andWhere: () => queryBuilder,
  setLock: () => queryBuilder,
  getMany: async () => [sourceInventoryItem],
}

const manager = {
  findOne: async (entity: unknown) => {
    if (entity === User) return user
    if (entity === DotaSkin) return targetDotaSkin
    return null
  },
  createQueryBuilder: () => queryBuilder,
  remove: async () => undefined,
  create: (_entity: unknown, data: unknown) => data,
  save: async (entity: any) => {
    if ('skin_id' in entity) {
      savedUpgradeHistory = entity
      return { ...entity, id: 1001 }
    }

    return { ...entity, id: 2001 }
  },
}

const entityManager = {
  transaction: async (callback: (manager: any) => Promise<unknown>) =>
    callback(manager),
}

const service = new UpgradeService(
  entityManager as any,
  { trackEvent: async () => undefined } as any,
  { recordEarning: async () => undefined } as any,
)

const originalRandom = Math.random

async function main() {
  try {
    Math.random = () => 0.99

    const result = await service.performUpgrade(1, {
      use_balance: false,
      inventory_skin_ids: [sourceInventoryItem.id],
      target_skin_id: targetDotaSkin.id,
      game_type: 'dota',
    })

    assert.equal(result.success, false)
    assert.equal(result.chance, 48)
    assert.equal(savedUpgradeHistory.game_type, 'dota')
    assert.equal(savedUpgradeHistory.materials[0].skin_id, sourceCsgoSkin.id)
    assert.equal(savedUpgradeHistory.materials[0].game_type, 'csgo')

    console.log('upgrade-cross-game.spec.ts passed')
  } finally {
    Math.random = originalRandom
  }
}

void main()
