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

export const DEFAULT_DMARKET_CONFIG: DMarketConfig = {
  apiKey: '64479a7d9740aaee76d09f4e2f34fa7b4d0a0112b7e3af8e6041a57e96c5bc81',
  secretKey:
    '2249788f66867de539b60c098511466e268bcddc9b3514da1e448e478effe04e64479a7d9740aaee76d09f4e2f34fa7b4d0a0112b7e3af8e6041a57e96c5bc81',
  baseUrl: 'https://api.dmarket.com',
  maxRequestsPerMinute: 20,
  requestDelay: 3000,
  minDelayBetweenRequests: 3000,
  batchSize: 100,
  retryAttempts: 3,
  retryDelay: 1000,
}

export const CS2_GAME_ID = 'a8db'
export const USD_CURRENCY = 'USD'
export const PROGRESS_LOG_INTERVAL = 5
