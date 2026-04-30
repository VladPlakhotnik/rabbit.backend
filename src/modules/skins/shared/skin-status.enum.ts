// Lifecycle of a skin in our DB. Driven by the daily sync against the
// authoritative market feed (market.csgo.com / market.dota2.net).
//
// Transitions:
//   sync sees skin in feed   → status = available
//   sync misses skin in feed → status = unavailable_on_market
//   admin toggles off        → status = disabled (stays sticky across sync runs)
//
// `disabled` is admin-only and not touched by the sync — once an admin
// pulls a skin out (e.g. broken image, legal restriction), the next
// sync run shouldn't accidentally flip it back to available. The sync
// service explicitly skips `disabled` rows when computing transitions.
export enum SkinStatus {
  Available = 'available',
  UnavailableOnMarket = 'unavailable_on_market',
  Disabled = 'disabled',
}

// CHECK constraint values — kept in sync with the SQL migration. If a
// new status is added, update both the enum AND
// `csgo_skins_status_check` in the migration.
export const SKIN_STATUS_VALUES = Object.values(SkinStatus)
