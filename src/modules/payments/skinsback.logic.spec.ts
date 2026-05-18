import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

import { UserDepositStatus } from '../users/user-deposit.entity'
import {
  extractSkinsbackTradeToken,
  getSkinsbackCreditAmount,
  getSkinsbackFailureReason,
  mapSkinsbackStatus,
  sanitizeSkinsbackPayload,
  verifySkinsbackSignature,
} from './skinsback.logic'

function mapsProcessorStatuses() {
  assert.equal(
    mapSkinsbackStatus('success'),
    UserDepositStatus.SUCCESS,
  )
  assert.equal(
    mapSkinsbackStatus('pending'),
    UserDepositStatus.WAITING,
  )
  assert.equal(
    mapSkinsbackStatus('in_hold'),
    UserDepositStatus.WAITING,
  )
  assert.equal(
    mapSkinsbackStatus('hold_approved'),
    UserDepositStatus.WAITING,
  )
  assert.equal(
    mapSkinsbackStatus('fail'),
    UserDepositStatus.CANCELLED,
  )
  assert.equal(
    mapSkinsbackStatus('hold_returned'),
    UserDepositStatus.CANCELLED,
  )
  assert.equal(
    mapSkinsbackStatus('unexpected'),
    UserDepositStatus.ERROR,
  )
}

function readsWebhookAmounts() {
  assert.equal(getSkinsbackCreditAmount({ amount: '10.50' }), 10.5)
  assert.equal(
    getSkinsbackCreditAmount({ amount: '10.50', user_amount: '12.345' }),
    12.35,
  )
  assert.equal(getSkinsbackCreditAmount({ amount: '-1' }), 0)
}

function extractsTradeTokens() {
  assert.equal(extractSkinsbackTradeToken('abcd1234'), 'abcd1234')
  assert.equal(
    extractSkinsbackTradeToken(
      'https://steamcommunity.com/tradeoffer/new/?partner=1&token=Ab_cd123',
    ),
    'Ab_cd123',
  )
  assert.equal(extractSkinsbackTradeToken('not-a-url'), null)
}

function verifiesWebhookSignature() {
  const clientId = 'client'
  const clientSecret = 'secret'
  const sign = createHash('md5')
    .update(`${clientId}${clientSecret}`)
    .digest('hex')

  assert.equal(
    verifySkinsbackSignature({ clientId, clientSecret, providedSign: sign }),
    true,
  )
  assert.equal(
    verifySkinsbackSignature({
      clientId,
      clientSecret,
      providedSign: 'wrong',
    }),
    false,
  )
}

function returnsFailureReasonAndSanitizesPayload() {
  assert.equal(getSkinsbackFailureReason({ reason: 'trade_timeout' }), 'trade_timeout')
  assert.equal(getSkinsbackFailureReason({ status: 'hold_returned' }), 'hold_returned')
  assert.deepEqual(
    sanitizeSkinsbackPayload({ amount: '10', sign: 'secret-sign' }),
    { amount: '10' },
  )
}

async function run() {
  mapsProcessorStatuses()
  readsWebhookAmounts()
  extractsTradeTokens()
  verifiesWebhookSignature()
  returnsFailureReasonAndSanitizesPayload()
}

void run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
