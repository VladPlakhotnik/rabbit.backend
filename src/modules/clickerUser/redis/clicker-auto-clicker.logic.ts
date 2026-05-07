import { AUTO_CLICKER_TICK_MS } from '../constants/clicker.constants'

export interface RestoredAutoClickerCycle {
  startedAtMs: number
  lastTickAtMs: number
}

export const deriveRestoredAutoClickerCycle = (
  pendingCount: number,
  snapshotTs: number,
): RestoredAutoClickerCycle => {
  const count = Math.max(0, Math.floor(pendingCount))
  if (count <= 0 || snapshotTs <= 0) {
    return { startedAtMs: 0, lastTickAtMs: 0 }
  }

  return {
    startedAtMs: Math.max(1, snapshotTs - count * AUTO_CLICKER_TICK_MS),
    lastTickAtMs: snapshotTs,
  }
}
