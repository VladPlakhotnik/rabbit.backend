import assert from 'node:assert/strict'

import {
  buildMinesMultiplierPath,
  calculateProjectedWin,
  countSafeMinesReveals,
  drawMinePositions,
  toCellIndex,
  toCellPosition,
} from './mines-game.logic'

const pathForFiveMines = buildMinesMultiplierPath({
  boardSize: 25,
  minesCount: 5,
})

assert.equal(pathForFiveMines.length, 20)
assert.equal(pathForFiveMines[0], 1.2)
assert.ok(pathForFiveMines[1] > pathForFiveMines[0])
assert.equal(calculateProjectedWin(1, pathForFiveMines[0]), 1.2)
assert.deepEqual(toCellPosition(7), { x: 2, y: 1 })
assert.equal(toCellIndex({ x: 2, y: 1 }), 7)
assert.equal(countSafeMinesReveals([], [1, 2, 3]), 0)
assert.equal(countSafeMinesReveals([4], [1, 2, 3]), 1)
assert.equal(countSafeMinesReveals([2], [1, 2, 3]), 0)
assert.equal(countSafeMinesReveals([2, 4, 5], [1, 2, 3]), 2)

const deterministicNumbers = [0, 4, 4, 24]
const mines = drawMinePositions(25, 3, maxExclusive => {
  const next = deterministicNumbers.shift()
  assert.notEqual(next, undefined)
  assert.ok(next! < maxExclusive)
  return next!
})

assert.deepEqual(mines, [0, 4, 24])
assert.equal(new Set(mines).size, 3)

console.log('mines-game.logic.spec.ts passed')
