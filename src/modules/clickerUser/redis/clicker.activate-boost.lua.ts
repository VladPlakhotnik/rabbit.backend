// Activate a consumable boost in Redis state.
//
// Inventory decrement happens BEFORE this script runs (in
// ClickerBoostsService.activate), so by the time Lua sees the call the
// player has already paid the inventory cost. We just stamp the active
// fields atomically.
//
// Atomic preconditions inside Lua:
//   1. Meta loaded — `c` field present. Caller bootstraps and retries
//      on -1.
//   2. No other boost currently running. Re-checked under Redis's
//      single-threaded executor so two concurrent activate calls don't
//      both pass.
//
// Active-boost fields:
//   ab  boost key (string; '' = no active boost)
//   at  expires-at ms (0 = no active boost)
//   ae  effect type ('infinite_energy' | 'multiplier' | '')
//   av  effect value (multiplier scalar; 0 / unused for infinite_energy)
//
// Returns the activation deadline in ms on success, or:
//   -1  meta missing → bootstrap and retry
//   -2  another boost already active
export const ACTIVATE_BOOST_LUA = `
local ukey = KEYS[1]
local now          = tonumber(ARGV[1]) or 0
local duration     = tonumber(ARGV[2]) or 0
local effect_type  = ARGV[3] or ''
local effect_value = tonumber(ARGV[4]) or 0
local boost_key    = ARGV[5] or ''

if duration <= 0 then return -2 end

-- 1. Meta check.
local cost_raw = redis.call('HGET', ukey, 'c')
if cost_raw == false or cost_raw == nil then
  return -1
end

-- 2. Already-active check inside Lua. Two concurrent activate calls
-- can't both land — second one reads the now-set deadline.
local at_raw = redis.call('HGET', ukey, 'at')
local at     = tonumber(at_raw) or 0
if at > 0 and now < at then
  return -2
end

local expires_at = now + duration * 1000
redis.call('HMSET', ukey,
  'ab', boost_key,
  'at', tostring(expires_at),
  'ae', effect_type,
  'av', tostring(effect_value))
return expires_at
`
