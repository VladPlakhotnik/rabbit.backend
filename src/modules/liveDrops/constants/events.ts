export const EVENTS = {
  // clicker (legacy — left intact, see clickerCase module)
  CLICK: 'click',
  CLICK_RESULT: 'clickResult',
  UPGRADE_CLICK: 'upgradeClick',
  UPGRADE_CLICK_RESULT: 'upgradeClickResult',
  UPGRADE_ENERGY: 'upgradeEnergy',
  UPGRADE_ENERGY_RESULT: 'upgradeEnergyResult',
  USER_UPDATE: 'userUpdate',
  ERROR: 'error',
  // live drops
  LIVE_DROP: 'liveDrop',
  INITIAL_DROPS: 'initialDrops',
} as const

export const NAMESPACE = 'live-drop'

import { getCorsOrigins } from '../../../core/config/cors'

// Evaluated once at import time. Requires `core/config/load-env` to be
// imported first in main.ts so process.env is already populated.
export const GATEWAY_CONFIG = {
  cors: {
    origin: getCorsOrigins(),
    credentials: true,
  },
  namespace: NAMESPACE,
  transports: ['websocket', 'polling'],
  pingInterval: 10000,
  pingTimeout: 5000,
} as const

// Redis keys & channels for LiveDrop feed.
// Keep names in one place so workers/services don't drift apart.
export const REDIS_FEED_KEY = 'livedrop:feed'
export const REDIS_PUBSUB_CHANNEL = 'livedrop:new'
export const MAX_FEED_SIZE = 15
