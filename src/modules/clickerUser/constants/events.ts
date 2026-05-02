import { getCorsOrigins } from '../../../core/config/cors'

export const EVENTS = {
  CLICK: 'click',
  CLICK_RESULT: 'clickResult',
  UPGRADE_CLICK: 'upgradeClick',
  UPGRADE_CLICK_RESULT: 'upgradeClickResult',
  UPGRADE_ENERGY: 'upgradeEnergy',
  UPGRADE_ENERGY_RESULT: 'upgradeEnergyResult',
  // Skill upgrades (auto-clicker / crit-click). On first call the
  // skill is unlocked at level 1 from a NULL state; subsequent calls
  // bump the tier through clicker_auto_clicker_levels / crit_click_levels.
  UPGRADE_AUTO_CLICKER: 'upgradeAutoClicker',
  UPGRADE_AUTO_CLICKER_RESULT: 'upgradeAutoClickerResult',
  UPGRADE_CRIT_CLICK: 'upgradeCritClick',
  UPGRADE_CRIT_CLICK_RESULT: 'upgradeCritClickResult',
  // Sent on the client's own socket only — used for state sync after upgrades
  // and after the periodic Postgres flush bumps a level. Never broadcast.
  USER_UPDATE: 'userUpdate',
  ERROR: 'error',
  GET_STATE: 'getState',
  STATE: 'state',
} as const

export const NAMESPACE = 'clicker'

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
