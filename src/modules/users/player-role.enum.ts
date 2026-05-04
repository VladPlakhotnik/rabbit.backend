// Game-user (player) roles. NOT to be confused with `AdminRole` from
// modules/admin — those are admin-panel staff with their own auth flow.
//
// Default for every newly-registered user is PLAYER. Other roles are
// granted manually by staff (PARTNER program signup, STREAMER vetting)
// or automatically by domain rules (VIP threshold).
export enum PlayerRole {
  PLAYER = 'player', // default — regular game user
  STREAMER = 'streamer', // verified content creator
  PARTNER = 'partner', // affiliate program member (revenue share)
  VIP = 'vip', // high-roller — auto-assigned by deposit / wager threshold
  INFLUENCER = 'influencer', // small-scale promoter, bonus codes etc.
  BETA_TESTER = 'beta_tester', // closed-beta access
}

// Convenience tuple for runtime checks.
export const PLAYER_ROLE_VALUES = Object.values(PlayerRole) as readonly string[]

export const isPlayerRole = (value: unknown): value is PlayerRole =>
  typeof value === 'string' && PLAYER_ROLE_VALUES.includes(value)
