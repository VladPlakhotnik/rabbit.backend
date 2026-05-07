import assert from 'node:assert/strict'
import { AUTO_CLICKER_TICK_MS } from '../constants/clicker.constants'
import { deriveRestoredAutoClickerCycle } from './clicker-auto-clicker.logic'

const snapshotTs = 1_778_030_000_000

assert.deepEqual(deriveRestoredAutoClickerCycle(0, snapshotTs), {
  startedAtMs: 0,
  lastTickAtMs: 0,
})

assert.deepEqual(deriveRestoredAutoClickerCycle(20, snapshotTs), {
  startedAtMs: snapshotTs - 20 * AUTO_CLICKER_TICK_MS,
  lastTickAtMs: snapshotTs,
})

assert.equal(
  deriveRestoredAutoClickerCycle(20, 10_000).startedAtMs,
  1,
)

console.log('clicker-auto-clicker.logic.spec.ts passed')
