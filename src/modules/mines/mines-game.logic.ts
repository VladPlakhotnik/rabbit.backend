import { randomInt } from 'node:crypto'

export const MINES_BOARD_SIZE = 25
export const MINES_GRID_SIZE = 5
export const MINES_HOUSE_RETURN = 0.96

export interface MultiplierPathInput {
  boardSize: number
  minesCount: number
}

export interface CellPosition {
  x: number
  y: number
}

export const roundMoney = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100

export const calculateProjectedWin = (
  betAmount: number,
  multiplier: number,
): number => roundMoney(betAmount * multiplier)

export const countSafeMinesReveals = (
  revealedCells: number[],
  minePositions: number[],
): number =>
  revealedCells.filter(cellIndex => !minePositions.includes(cellIndex)).length

export const buildMinesMultiplierPath = ({
  boardSize,
  minesCount,
}: MultiplierPathInput): number[] => {
  const safeCells = boardSize - minesCount

  if (boardSize <= 0 || minesCount <= 0 || safeCells <= 0) {
    return []
  }

  const multipliers: number[] = []
  let safeProbability = 1

  for (let revealIndex = 0; revealIndex < safeCells; revealIndex += 1) {
    safeProbability *= (safeCells - revealIndex) / (boardSize - revealIndex)
    const fairMultiplier = 1 / safeProbability
    multipliers.push(roundMoney(fairMultiplier * MINES_HOUSE_RETURN))
  }

  return multipliers
}

export const drawMinePositions = (
  boardSize: number,
  minesCount: number,
  randomInteger: (maxExclusive: number) => number = randomInt,
): number[] => {
  if (boardSize <= 0 || minesCount <= 0 || minesCount >= boardSize) {
    return []
  }

  const positions = new Set<number>()

  while (positions.size < minesCount) {
    positions.add(randomInteger(boardSize))
  }

  return Array.from(positions).sort((a, b) => a - b)
}

export const toCellIndex = ({ x, y }: CellPosition): number =>
  y * MINES_GRID_SIZE + x

export const toCellPosition = (index: number): CellPosition => ({
  x: index % MINES_GRID_SIZE,
  y: Math.floor(index / MINES_GRID_SIZE),
})
