/**
 * Bank-style autoclicker telemetry rolled into every click / state ack.
 * Lets the frontend render the pending badge + claim modal without a
 * separate fetch.
 */
export interface AutoClickerAckSlice {
  /**
   * Autoclicker ticks credited to the bank during this Lua call. NOT
   * cumulative — diff against `pendingCount` for "did the bank grow
   * this turn".
   */
  autoCredited: number
  /**
   * ms-since-epoch when accumulation started. 0 = not currently
   * accumulating. Drives the modal's "elapsed since started" text.
   */
  autoClickerStartedAtMs: number
  /**
   * Max idle accumulation seconds for the player's owned tier. 0 =
   * autoclicker not unlocked. Doubles as the "cap" displayed on the
   * upgrade box when the bank is empty.
   */
  autoClickerMaxIdleSec: number
  /** Pending click count waiting to be claimed (0 = empty bank). */
  autoClickerPendingCount: number
  /** Pending point value waiting to be claimed (0 = empty bank). */
  autoClickerPendingValue: number
  /** Active consumable boost key. null when no server-side boost is running. */
  activeBoostKey: string | null
  /** Absolute active boost deadline in ms-since-epoch. 0 when inactive. */
  activeBoostExpiresAtMs: number
}

/**
 * Sent on every successful click batch (`clickResult`) and as the response
 * payload for `userUpdate`. `accepted` is the number of clicks the server
 * actually applied — may be less than the request when energy ran out.
 *
 * `points`/`energy` are absolute current values (post-batch), not deltas.
 */
export interface ClickAckPayload extends AutoClickerAckSlice {
  userId: number
  accepted: number
  points: number
  /**
   * Lifetime carrots earned. Spending only touches `points`; this
   * keeps growing. The progress bar on the client reads from this
   * so it doesn't visibly regress when the player spends.
   */
  totalPoints: number
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

/**
 * Ack for the claimAutoClicker WS event. Both `claimed*` are 0 on a
 * no-op claim (the bank was already empty); `points` is the post-claim
 * balance regardless.
 */
export interface AutoClickerClaimAck {
  userId: number
  claimedCount: number
  claimedValue: number
  points: number
  /**
   * Lifetime carrots — included so the post-claim ack can refresh
   * the progress bar even though the claim itself doesn't advance
   * the lifetime tally (autoclicker ticks already credited it
   * during simulation).
   */
  totalPoints: number
}

export interface UpgradeAckPayload extends AutoClickerAckSlice {
  userId: number
  points: number
  /** Lifetime carrots earned. See ClickAckPayload.totalPoints. */
  totalPoints: number
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
