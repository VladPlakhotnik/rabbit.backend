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

export interface ErrorResponse {
  message: string
}
