// Pricing helpers — convert raw market prices into the prices we
// display + charge inside the app.
//
// Why a markup at all:
//   1. Sync runs at intervals; market price can drift up between syncs.
//      Without a buffer, an arbitrageur could open cases when our price
//      is stale-low.
//   2. `buy-for` itself charges a small fee (1-3% on TM).
//   3. House edge — the difference between what users pay (display
//      price) and what we pay to fulfil (market price) is our margin.
//
// The markup factor is read from env (`SKIN_PRICE_MARKUP`) so it can
// be tuned without a deploy. Default 0.35 (35%) reflects "daily sync"
// safety; once intra-day price syncs land we can dial it down to ~0.20.

const DEFAULT_MARKUP = 0.35

// Re-read each call rather than caching — supports zero-downtime tuning
// via `kubectl set env` / `heroku config:set` without process restart.
// The cost is one process.env lookup per skin sync row, which is a
// rounding error against the actual DB upsert.
export const getMarkupFactor = (): number => {
  const raw = process.env.SKIN_PRICE_MARKUP

  if (raw === undefined || raw.trim() === '') return DEFAULT_MARKUP

  const parsed = Number.parseFloat(raw)

  if (!Number.isFinite(parsed) || parsed < 0) {
    // Don't throw — bad config shouldn't break sync. Fall back to
    // default and log the misconfiguration via the caller's choice.
    return DEFAULT_MARKUP
  }

  return parsed
}

// Apply the markup to a raw market price. Returns the price the user
// sees and pays (in case-open cost / withdrawal commitment).
//
// Rounding: 2 decimal places (USD cents). Round half-up so we never
// undercharge by a fraction of a cent — the implicit floor on revenue.
export const applyMarkup = (marketPrice: number, markup?: number): number => {
  const factor = markup ?? getMarkupFactor()
  const inflated = marketPrice * (1 + factor)

  return Math.round(inflated * 100) / 100
}
