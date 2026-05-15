import { strict as assert } from 'node:assert'
import {
  resolveCountryFromHeaders,
  shouldSetUserCountry,
} from './user-country'

assert.deepEqual(resolveCountryFromHeaders({ 'cf-ipcountry': 'pl' }), {
  countryCode: 'PL',
  source: 'cf-ipcountry',
})

assert.deepEqual(
  resolveCountryFromHeaders({
    'cf-ipcountry': 'XX',
    'x-vercel-ip-country': 'us',
  }),
  {
    countryCode: 'US',
    source: 'x-vercel-ip-country',
  },
)

assert.deepEqual(
  resolveCountryFromHeaders({ 'x-country-code': ['de', 'fr'] }),
  {
    countryCode: 'DE',
    source: 'x-country-code',
  },
)

assert.equal(resolveCountryFromHeaders({ 'cf-ipcountry': 'T1' }), null)
assert.equal(resolveCountryFromHeaders({ 'x-vercel-ip-country': 'EU' }), null)
assert.equal(resolveCountryFromHeaders({ 'x-country-code': 'pol' }), null)

assert.equal(shouldSetUserCountry(null, { countryCode: 'PL', source: 'cf-ipcountry' }), true)
assert.equal(
  shouldSetUserCountry({ country_code: '', country_source: null }, { countryCode: 'PL', source: 'cf-ipcountry' }),
  true,
)
assert.equal(
  shouldSetUserCountry({ country_code: 'PL', country_source: 'cf-ipcountry' }, { countryCode: 'US', source: 'x-vercel-ip-country' }),
  false,
)
assert.equal(shouldSetUserCountry({ country_code: null, country_source: null }, null), false)

