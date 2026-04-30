// Parse a Steam trade-offer URL into the (partner, token) pair the TM
// `/buy-for` endpoint expects.
//
// Accepted form (from Steam's "Trade offers → Who can send me?" page):
//   https://steamcommunity.com/tradeoffer/new/?partner=1234567&token=ABCDEFGH
//
// Why a dedicated parser:
//   - users paste anything (full URL, query string fragment, with/without
//     trailing slash, sometimes the "for" link instead of the "new" link)
//   - `URL` constructor doesn't validate steamcommunity.com host, so we
//     do that ourselves
//   - TM rejects bad partner / token *after* we've already debited our
//     balance; catching malformed input before the call saves a refund
//
// Returns null on any validation failure — caller throws a 400 with a
// translated message rather than leaking the parser internals.

const STEAM_HOST = 'steamcommunity.com'
const TRADE_OFFER_PATH = '/tradeoffer/new/'

// Steam partner ids are 32-bit account ids — always positive integers.
// Tokens are 8-char alphanumeric. Patterns are conservative on purpose:
// reject anything that looks suspicious rather than relax and forward
// to TM.
const PARTNER_PATTERN = /^[0-9]{1,10}$/
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{6,16}$/

export interface ParsedTradeUrl {
  partner: string
  token: string
}

export const parseTradeUrl = (raw: string | null | undefined): ParsedTradeUrl | null => {
  if (!raw || typeof raw !== 'string') return null

  const trimmed = raw.trim()
  if (trimmed.length === 0 || trimmed.length > 512) return null

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }

  // host must be steamcommunity.com (allow www. prefix as a courtesy)
  const host = parsed.host.toLowerCase()
  if (host !== STEAM_HOST && host !== `www.${STEAM_HOST}`) {
    return null
  }

  // path must be exactly /tradeoffer/new/ — Steam also has /tradeoffer/<id>
  // for received offers; that's a different page that won't work here.
  if (parsed.pathname !== TRADE_OFFER_PATH) {
    return null
  }

  const partner = parsed.searchParams.get('partner')
  const token = parsed.searchParams.get('token')

  if (!partner || !PARTNER_PATTERN.test(partner)) return null
  if (!token || !TOKEN_PATTERN.test(token)) return null

  return { partner, token }
}
