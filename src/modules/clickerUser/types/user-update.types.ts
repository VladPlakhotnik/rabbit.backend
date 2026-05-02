/**
 * Sent on every successful click batch (`clickResult`) and as the response
 * payload for `userUpdate`. `accepted` is the number of clicks the server
 * actually applied — may be less than the request when energy ran out.
 *
 * `points`/`energy` are absolute current values (post-batch), not deltas.
 */
export interface ClickAckPayload {
  userId: number
  accepted: number
  points: number
  energy: number
  maxEnergy: number
  cost: number
  /** Energy regen per second; client extrapolates locally between acks. */
  regenPerSec: number
  level: number | null
  clickLevel: number | null
  energyLevel: number | null
  /** How many of the accepted clicks landed a 10× crit. 0 when skill not unlocked. */
  critCount: number
}

export interface UpgradeAckPayload {
  userId: number
  points: number
  energy: number
  maxEnergy: number
  cost: number
  /** Energy regen per second; client extrapolates locally between acks. */
  regenPerSec: number
  level: number | null
  clickLevel: number | null
  energyLevel: number | null
}

/**
 * Ack returned from the auto-clicker / crit-click upgrade WS calls.
 * Distinct from UpgradeAckPayload because the click pipeline doesn't
 * yet know about skill tiers (lands in PR3/PR4) — this payload only
 * carries what the player needs to update the Shop / UpgradeBox UI:
 * the new level, the new effective stat, and the post-debit balance.
 */
export interface SkillUpgradeAckPayload {
  userId: number
  skill: 'auto_clicker' | 'crit_click'
  /** Numeric tier (1-based). 1 means "just unlocked". */
  level: number
  /** Row id in clicker_auto_clicker_levels / clicker_crit_click_levels. */
  levelId: number
  /** Post-debit carrots balance. */
  points: number
  /** Auto-clicker only — seconds the autoclicker runs per Activate. */
  durationSec?: number
  /** Crit-click only — chance percent of the x10 multiplier landing. */
  critChancePct?: number
}

export interface ErrorResponse {
  message: string
}
