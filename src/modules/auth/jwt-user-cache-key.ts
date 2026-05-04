// Shared key for the in-memory user-row cache that JwtStrategy uses
// to skip the DB hit on every authed request. Owned semantically by
// JwtStrategy (it's the only producer); UserService imports it as a
// CONSUMER so any user mutation (link Steam/Google/Telegram, update
// trade link, balance changes that flow through here, etc.) can call
// `cache.del(jwtUserCacheKey(userId))` and force the next request to
// rebuild the cached row from fresh DB state.
//
// Without that invalidation step the user would keep seeing their
// pre-mutation profile via /users/me for up to JWT_USER_CACHE_TTL_MS
// (30 s) — manifested as "I just linked Google but the badge still
// shows null for ten seconds".

export const jwtUserCacheKey = (userId: number): string =>
  `jwt:user:${userId}`
