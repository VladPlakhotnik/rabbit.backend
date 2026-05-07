import assert from 'node:assert/strict'
import {
  MINES_BOT_INTERVAL_MAX_MS,
  MINES_BOT_INTERVAL_MIN_MS,
  buildMinesBotDropPayload,
  pickMinesBotDelayMs,
} from './mines-live-bots.logic'
import { buildDefaultBotProfile } from '../../bots/bot-behavior.logic'

const minDelay = pickMinesBotDelayMs(() => 0)
assert.equal(minDelay, MINES_BOT_INTERVAL_MIN_MS)

const maxDelay = pickMinesBotDelayMs(() => 1)
assert.equal(maxDelay, MINES_BOT_INTERVAL_MAX_MS)

const bot = buildDefaultBotProfile({
  id: 42,
  display_name: 'ScopeWizard',
  avatar: 'https://example.com/avatar.png',
})

const randomValues = [
  0.01, // mines count option
  0.25, // personality stake
  0.9, // no impulsive stake
  0.3, // bot mines settings
  0.2, 0.4, 0.6, // mines positions
  0.2, // cashed_out
  0.1, // revealed safe count
]

const payload = buildMinesBotDropPayload(bot, {
  now: 1_778_030_000_000,
  random: () => randomValues.shift() ?? 0,
})

assert.equal(payload.isBot, true)
assert.equal(payload.user.id, bot.id)
assert.equal(payload.user.username, bot.display_name)
assert.equal(payload.user.avatar, bot.avatar)
assert.equal(payload.session.user?.id, bot.id)
assert.equal(payload.session.board_size, 25)
assert.equal(payload.session.status, 'cashed_out')
assert.equal(payload.multiplier, payload.session.current_multiplier)
assert.equal(payload.profit, Number((payload.session.win_amount! - payload.session.bet_amount).toFixed(2)))
assert.ok(payload.session.revealed_cells.length > 0)
assert.ok(payload.session.mine_cells?.length === payload.session.mines_count)

console.log('mines-live-bots.logic.spec.ts passed')
