import 'reflect-metadata'
import assert from 'node:assert/strict'

import { AdminSkinsController } from './admin-skins.controller'
import { SkinStatus } from './shared/skin-status.enum'

const createRepo = () => {
  const rows = new Map<number, Record<string, unknown>>()
  let nextId = 1

  const repo = {
    rows,
    create: (value: Record<string, unknown>) => ({ ...value }),
    findOne: async ({ where }: { where: Record<string, unknown> }) => {
      const entries = [...rows.values()]
      return (
        entries.find(row =>
          Object.entries(where).every(([key, value]) => row[key] === value),
        ) ?? null
      )
    },
    save: async (value: Record<string, unknown>) => {
      const id = Number(value.id ?? nextId++)
      const row = { ...value, id }
      rows.set(id, row)
      return row
    },
  }

  return repo
}

const createController = () => {
  const csgoRepo = createRepo()
  const dotaRepo = createRepo()
  const controller = new AdminSkinsController(
    { getRepo: () => csgoRepo } as never,
    { getRepo: () => dotaRepo } as never,
  )

  return { controller, csgoRepo, dotaRepo }
}

const run = async () => {
  {
    const { controller, dotaRepo } = createController()

    const created = await (controller as any).create({
      game_type: 'dota',
      market_hash_name: 'Test Dota Skin',
      market_price: 12.5,
      status: SkinStatus.Available,
    })

    assert.equal(created.id, 1)
    assert.equal(created.market_hash_name, 'Test Dota Skin')
    assert.equal(created.name, 'Test Dota Skin')
    assert.equal(created.status, SkinStatus.Available)
    assert.equal(dotaRepo.rows.size, 1)
  }

  {
    const { controller, csgoRepo } = createController()
    const existing = await csgoRepo.save({
      id: 42,
      market_hash_name: 'AK-47 | Test',
      name: 'AK-47 | Test',
      status: SkinStatus.Available,
      market_price: 10,
    })

    const updated = await (controller as any).update('csgo', existing.id, {
      name: 'AK-47 | Updated',
      market_price: 11.25,
    })

    assert.equal(updated.name, 'AK-47 | Updated')
    assert.equal(updated.market_price, 11.25)

    const disabled = await (controller as any).setStatus('csgo', existing.id, {
      status: SkinStatus.Disabled,
    })

    assert.equal(disabled.status, SkinStatus.Disabled)
  }
}

run()
