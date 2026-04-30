export interface DMarketConfig {
  apiKey: string
  secretKey: string
  baseUrl: string
  maxRequestsPerMinute: number
  requestDelay: number
  minDelayBetweenRequests: number
  batchSize: number
  retryAttempts: number
  retryDelay: number
}

// Read DMarket credentials from process.env, throw at startup if missing.
// Previously hard-coded values lived here and shipped to git — see PR0.
// Tunable knobs (rate-limit, batch, retry) keep their non-secret defaults
// since they're not credentials and tweaking them in env adds friction
// for no benefit.
const requireEnv = (name: string): string => {
  const value = process.env[name]
  if (!value || value.trim() === '' || value === 'replace_me') {
    throw new Error(
      `${name} is not set. Copy .env.example → .env and fill in real DMarket credentials.`,
    )
  }
  return value
}

// Empirically observed limit (api.dmarket.com, authenticated Trading
// API key): the response headers expose `x-ratelimit-limit-second=20`
// and `x-ratelimit-remaining-second=N`, i.e. the bucket is *per-second*
// per endpoint, not per-minute. The FAQ's "3 RPS for non-authorized,
// account-based for authorized" line glosses over the actual ceiling.
//
// We pace at 18 RPS (60 ms between requests) to leave 10% headroom
// for clock skew + the cron scheduler running price + catalog jobs
// concurrently. The minute cap is set proportional (1080 / min) so
// the rolling-window guard in RateLimiterService stays consistent
// with the per-request gap.
//
// DMarket also advertises a `trading.dmarket.com` gateway "for
// automated trading at 10 RPS" — but as of 2026-04 it has no DNS
// A-records (checked against 8.8.8.8 and 1.1.1.1). The 20 RPS limit
// on api.dmarket.com is already double what the trading domain
// promised, so the missing gateway is a non-issue.
export const buildDMarketConfig = (): DMarketConfig => ({
  apiKey: requireEnv('DMARKET_API_KEY'),
  secretKey: requireEnv('DMARKET_SECRET_KEY'),
  baseUrl: 'https://api.dmarket.com',
  maxRequestsPerMinute: 1080,
  requestDelay: 60,
  minDelayBetweenRequests: 60,
  batchSize: 100,
  retryAttempts: 3,
  retryDelay: 1000,
})

export const CS2_GAME_ID = 'a8db'
export const DOTA2_GAME_ID = '9a92'
export const USD_CURRENCY = 'USD'
export const PROGRESS_LOG_INTERVAL = 5
