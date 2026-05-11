import assert from 'node:assert/strict'
import {
  buildPartnerPostbackPayload,
  isSafePartnerPostbackUrl,
  signPartnerPostbackPayload,
} from './partner-postback.utils'

const payload = buildPartnerPostbackPayload({
  eventType: 'registration',
  partnerUserId: 12,
  data: {
    campaign_id: 4,
    source: 'telegram',
  },
})

assert.equal(payload.event, 'registration')
assert.equal(payload.partner_user_id, 12)
assert.equal(payload.data.campaign_id, 4)
assert.match(payload.event_id, /^evt_[a-f0-9]{24}$/)
assert.match(payload.occurred_at, /^\d{4}-\d{2}-\d{2}T/)

assert.equal(
  signPartnerPostbackPayload(payload, 'secret').length,
  64,
  'signature should be a hex sha256 hmac',
)

assert.equal(isSafePartnerPostbackUrl('https://tracker.example/postback'), true)
assert.equal(isSafePartnerPostbackUrl('http://tracker.example/postback'), false)
assert.equal(isSafePartnerPostbackUrl('https://localhost/postback'), false)
assert.equal(isSafePartnerPostbackUrl('https://127.0.0.1/postback'), false)
assert.equal(isSafePartnerPostbackUrl('https://[::1]/postback'), false)
assert.equal(isSafePartnerPostbackUrl('https://10.0.0.5/postback'), false)
assert.equal(isSafePartnerPostbackUrl('https://100.64.0.10/postback'), false)
assert.equal(isSafePartnerPostbackUrl('https://172.20.0.2/postback'), false)
assert.equal(isSafePartnerPostbackUrl('https://192.168.1.8/postback'), false)
assert.equal(isSafePartnerPostbackUrl('https://224.0.0.1/postback'), false)
assert.equal(isSafePartnerPostbackUrl('https://tracker.local/postback'), false)
