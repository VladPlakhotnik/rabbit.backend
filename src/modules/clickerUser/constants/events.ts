export const EVENTS = {
  CLICK: 'click',
  CLICK_RESULT: 'clickResult',
  UPGRADE_CLICK: 'upgradeClick',
  UPGRADE_CLICK_RESULT: 'upgradeClickResult',
  UPGRADE_ENERGY: 'upgradeEnergy',
  UPGRADE_ENERGY_RESULT: 'upgradeEnergyResult',
  USER_UPDATE: 'userUpdate',
  ERROR: 'error',
  GET_ENERGY_INFO: 'getEnergyInfo',
  ENERGY_INFO: 'energyInfo',
} as const

export const NAMESPACE = 'clicker'

export const GATEWAY_CONFIG = {
  cors: {
    origin: '*', // TODO: Replace with specific domain in production
  },
  namespace: NAMESPACE,
  transports: ['websocket', 'polling'],
  pingInterval: 10000,
  pingTimeout: 5000,
} as const
