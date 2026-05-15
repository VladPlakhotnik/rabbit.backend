import assert from 'node:assert/strict'
import { normalizeUserBlockInput } from './user-block'

const fraud = normalizeUserBlockInput({
  reason: '  Multi-account abuse  ',
  template: 'fraud',
})

assert.deepEqual(fraud, {
  reason: 'Multi-account abuse',
  template: 'fraud',
})

assert.throws(
  () => normalizeUserBlockInput({ reason: '   ', template: 'chargeback' }),
  /reason is required/i,
)

assert.throws(
  () => normalizeUserBlockInput({ reason: 'Manual reason', template: 'unknown' }),
  /invalid block reason template/i,
)
