// "Dismiss" the autoclicker bank summary modal.
//
// Points are credited DURING simulation (see clicker.lua), so this
// script does NOT touch `points` — that would double-credit. It just
// zeroes the per-cycle tally fields (apc/apv/as/ac) and stamps
// `lc=now`, which closes the current cycle and opens the door for a
// fresh one once the player goes idle again.
//
// Idempotent: a double-tap on Dismiss reads apc=0 and is a clean
// no-op. The return tuple still surfaces the (apc, apv, points) the
// caller will display so the frontend can render the summary even
// on the racy second click.
//
// Returns: { code, claimed_count, claimed_value, points_after,
//            total_points }
//   code = 0 → ok (always; even when nothing was pending)
//   code = 1 → meta missing; caller bootstraps & retries
export const CLAIM_AUTO_LUA = `
local ukey = KEYS[1]
local dkey = KEYS[2]
local user = ARGV[1]
local now  = tonumber(ARGV[2]) or 0

local p_raw = redis.call('HGET', ukey, 'p')
if p_raw == false or p_raw == nil then
  return {1, 0, 0, 0, 0}
end

local apc = tonumber(redis.call('HGET', ukey, 'apc')) or 0
local apv = tonumber(redis.call('HGET', ukey, 'apv')) or 0
local tp  = tonumber(redis.call('HGET', ukey, 'tp')) or 0
local points = tonumber(p_raw) or 0

redis.call('HMSET', ukey,
  'apc', '0',
  'apv', '0',
  'as', '0',
  'ac', '0',
  'lc', tostring(now))

-- Cycle reset still bumps the dirty set so the cleared apc/apv hit PG
-- — without it a Redis eviction could resurrect ghost pending from
-- the last flushed snapshot.
if apc > 0 or apv > 0 then
  redis.call('SADD', dkey, user)
end

return {0, apc, apv, points, tp}
`
