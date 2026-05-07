import { getCorsOrigins } from '../../core/config/cors'

export const CRASH_LIVE_WAIT_MS = 15_000
export const CRASH_LIVE_RESET_MS = 3_200
export const CRASH_LIVE_TICK_MS = 100
export const CRASH_LIVE_HISTORY_LIMIT = 16
export const CRASH_LIVE_MIN_BOTS = 3
export const CRASH_LIVE_MAX_BOTS = 20

export const CRASH_LIVE_EVENTS = {
  INITIAL_STATE: 'initialCrashLiveState',
  STATE: 'crashLiveState',
} as const

export const CRASH_LIVE_GATEWAY_CONFIG = {
  cors: {
    origin: getCorsOrigins(),
    credentials: true,
  },
  namespace: 'crash-live',
  transports: ['websocket', 'polling'],
  pingInterval: 10000,
  pingTimeout: 5000,
} as const
