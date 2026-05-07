export const CLICKER_CATALOG_CACHE_TTL_MS = 5 * 60 * 1000

// Public catalogs are admin-curated and not player-secret. Let browsers/CDNs
// reuse them briefly and serve stale while they refresh in the background.
export const CLICKER_CATALOG_CACHE_CONTROL =
  'public, max-age=300, stale-while-revalidate=3600'
