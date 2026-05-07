import { randomUUID } from 'node:crypto'
import {
  BotProfileSnapshot,
  pickBotStake,
  pickMinesBotSettings,
  roundBotMoney,
} from '../../bots/bot-behavior.logic'
import {
  buildMinesMultiplierPath,
  calculateProjectedWin,
  drawMinePositions,
  MINES_BOARD_SIZE,
  roundMoney,
} from '../mines-game.logic'
import type { PublicMinesSession } from '../mines.service'
import type { MinesLiveDropPayload } from './mines-live.types'

export const MINES_BOT_INTERVAL_MIN_MS = 1_500
export const MINES_BOT_INTERVAL_MAX_MS = 10_000

const MIN_BET_AMOUNT = 0.5
const MAX_CASHOUT_REVEALS = 8
const MAX_LOSS_SAFE_REVEALS = 5

const MINES_COUNT_OPTIONS = [
  3,
  3,
  3,
  5,
  5,
  7,
  10,
  15,
  20,
] as const

export type MinesBotUserSnapshot = BotProfileSnapshot

export interface BuildMinesBotDropOptions {
  now?: number
  random?: () => number
}

export const pickMinesBotDelayMs = (
  random: () => number = Math.random,
): number =>
  Math.round(
    MINES_BOT_INTERVAL_MIN_MS +
      random() * (MINES_BOT_INTERVAL_MAX_MS - MINES_BOT_INTERVAL_MIN_MS),
  )

const pickFrom = <T>(items: readonly T[], random: () => number): T =>
  items[Math.min(items.length - 1, Math.floor(random() * items.length))]

const randomInt = (
  maxExclusive: number,
  random: () => number = Math.random,
): number => Math.min(maxExclusive - 1, Math.floor(random() * maxExclusive))

const getMaxBetAmount = (minesCount: number): number => {
  if (minesCount >= 20) return 5
  if (minesCount >= 15) return 8
  if (minesCount >= 10) return 12
  if (minesCount >= 7) return 10
  if (minesCount >= 5) return 18
  return 25
}

const getCashoutProbability = (
  minesCount: number,
  botSettingsCashoutProbability?: number,
): number => {
  if (botSettingsCashoutProbability !== undefined) {
    return botSettingsCashoutProbability
  }

  if (minesCount >= 20) return 0.46
  if (minesCount >= 15) return 0.54
  if (minesCount >= 10) return 0.62
  if (minesCount >= 7) return 0.68
  return 0.74
}

const getCashoutRevealCap = (
  minesCount: number,
  maxSafeReveals: number,
): number => {
  const riskCap =
    minesCount >= 15
      ? 3
      : minesCount >= 10
        ? 4
        : minesCount >= 7
          ? 5
          : minesCount >= 5
            ? 6
            : MAX_CASHOUT_REVEALS
  return Math.min(riskCap, maxSafeReveals)
}

const pickBetAmount = (
  bot: MinesBotUserSnapshot,
  minesCount: number,
  random: () => number,
): number => {
  const personalityStake = pickBotStake(bot, 'mines', random)
  const maxBetAmount = Math.min(getMaxBetAmount(minesCount), bot.maxStake)

  return roundMoney(
    Math.max(
      MIN_BET_AMOUNT,
      Math.min(maxBetAmount, roundBotMoney(personalityStake)),
    ),
  )
}

const pickHumanLikeRevealCount = (
  maxRevealCount: number,
  random: () => number,
): number => {
  if (maxRevealCount <= 1) return 1

  return Math.min(
    maxRevealCount,
    1 + Math.floor(Math.pow(random(), 2.2) * maxRevealCount),
  )
}

const pickRevealedSafeCells = (
  safeCells: number[],
  count: number,
  random: () => number,
): number[] => {
  const pool = [...safeCells]
  const picked: number[] = []

  while (picked.length < count && pool.length > 0) {
    const index = randomInt(pool.length, random)
    picked.push(pool[index])
    pool.splice(index, 1)
  }

  return picked.sort((a, b) => a - b)
}

export const buildMinesBotDropPayload = (
  bot: MinesBotUserSnapshot,
  options: BuildMinesBotDropOptions = {},
): MinesLiveDropPayload => {
  const random = options.random ?? Math.random
  const now = options.now ?? Date.now()
  const minesCount = pickFrom(MINES_COUNT_OPTIONS, random)
  const betAmount = pickBetAmount(bot, minesCount, random)
  const botSettings = pickMinesBotSettings(bot, betAmount, random)
  const multipliers = buildMinesMultiplierPath({
    boardSize: MINES_BOARD_SIZE,
    minesCount,
  })
  const mineCells = drawMinePositions(MINES_BOARD_SIZE, minesCount, max =>
    randomInt(max, random),
  )
  const mineSet = new Set(mineCells)
  const safeCells = Array.from({ length: MINES_BOARD_SIZE }, (_, index) => index)
    .filter(index => !mineSet.has(index))
    .sort((a, b) => a - b)
  const isCashout =
    random() < getCashoutProbability(minesCount, botSettings.cashoutProbability)
  const maxSafeReveals = Math.max(1, safeCells.length)
  const cashoutRevealCap = Math.min(
    getCashoutRevealCap(minesCount, maxSafeReveals),
    botSettings.revealCap,
  )
  const lossSafeRevealCap = Math.min(MAX_LOSS_SAFE_REVEALS, maxSafeReveals)

  const safeRevealCount = isCashout
    ? pickHumanLikeRevealCount(cashoutRevealCap, random)
    : randomInt(lossSafeRevealCap + 1, random)
  const revealedSafeCells = pickRevealedSafeCells(
    safeCells,
    safeRevealCount,
    random,
  )

  const revealedCells =
    isCashout || mineCells.length === 0
      ? revealedSafeCells
      : [...revealedSafeCells, mineCells[0]].sort((a, b) => a - b)

  const multiplier = isCashout
    ? multipliers[Math.max(0, safeRevealCount - 1)] ?? 1
    : 0
  const winAmount = isCashout ? calculateProjectedWin(betAmount, multiplier) : 0
  const profit = roundMoney(winAmount - betAmount)
  const status: PublicMinesSession['status'] = isCashout ? 'cashed_out' : 'lost'
  const timestamp = new Date(now)

  const session: PublicMinesSession = {
    game_session_id: -Math.max(1, Math.floor(now % 2_147_483_647)),
    status,
    stake_mode: 'balance',
    mines_count: minesCount,
    board_size: MINES_BOARD_SIZE,
    bet_amount: betAmount,
    current_multiplier: multiplier,
    next_multiplier: null,
    potential_win: winAmount,
    win_amount: winAmount,
    revealed_cells: revealedCells,
    mine_cells: mineCells,
    multipliers,
    stake_items: [],
    created_at: timestamp,
    updated_at: timestamp,
    user: {
      id: bot.id,
      display_name: bot.display_name,
      avatar: bot.avatar,
    },
  }

  return {
    id: randomUUID(),
    user: {
      id: bot.id,
      username: bot.display_name,
      avatar: bot.avatar,
    },
    session,
    multiplier,
    profit,
    isBot: true,
    ts: now,
  }
}
