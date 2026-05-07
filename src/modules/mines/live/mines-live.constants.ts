import { getCorsOrigins } from '../../../core/config/cors'

export const MINES_LIVE_EVENTS = {
  LIVE_DROP: 'minesLiveDrop',
  INITIAL_DROPS: 'initialMinesLiveDrops',
} as const

export const MINES_LIVE_NAMESPACE = 'mines-live'

export const MINES_LIVE_GATEWAY_CONFIG = {
  cors: {
    origin: getCorsOrigins(),
    credentials: true,
  },
  namespace: MINES_LIVE_NAMESPACE,
  transports: ['websocket', 'polling'],
  pingInterval: 10000,
  pingTimeout: 5000,
} as const

export const MINES_LIVE_REDIS_FEED_KEY = 'mines:live:feed'
export const MINES_LIVE_REDIS_PUBSUB_CHANNEL = 'mines:live:new'
export const MINES_LIVE_MAX_FEED_SIZE = 10
