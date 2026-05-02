// Activate the auto-clicker for a user.
//
// Atomic preconditions:
//   1. Meta must be loaded (`c` field present). Caller bootstraps and retries
//      on -1; we never silently activate against a half-loaded state.
//   2. Auto-clicker must NOT already be running. Lua re-checks the deadline
//      under Redis's single-threaded executor — even if two `activate`
//      requests race, only the first one writes the state, the second one
//      reads the now-set deadline and returns -2.
//
// Sets three state fields:
//   as  start timestamp (ms)
//   ad  duration (sec)        — server-controlled, never from client payload
//   ac  last collected (ms)   — initialised to `as` so the first click after
//                               activation collects exactly the elapsed slice
//
// Returns the activation deadline (ms-since-epoch) on success, or:
//   -1  meta missing → bootstrap and retry
//   -2  already active
export const ACTIVATE_AUTO_LUA = `
local ukey = KEYS[1]
local now      = tonumber(ARGV[1]) or 0
local duration = tonumber(ARGV[2]) or 0

if duration <= 0 then return -2 end

-- 1. Meta-loaded check.
local cost_raw = redis.call('HGET', ukey, 'c')
if cost_raw == false or cost_raw == nil then
  return -1
end

-- 2. Already-active check. Re-check inside Lua so two concurrent activate
-- calls don't both pass.
local as_raw = redis.call('HGET', ukey, 'as')
local as     = tonumber(as_raw) or 0
local ad_raw = redis.call('HGET', ukey, 'ad')
local ad     = tonumber(ad_raw) or 0
if as > 0 and ad > 0 and now < (as + ad * 1000) then
  return -2
end

redis.call('HMSET', ukey,
  'as', tostring(now),
  'ad', tostring(duration),
  'ac', tostring(now))
return now + duration * 1000
`
