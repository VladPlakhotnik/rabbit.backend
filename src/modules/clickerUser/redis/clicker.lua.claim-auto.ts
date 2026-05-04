// Claim the autoclicker pending bank.
//
// Credits the per-cycle tally (apv) into the spendable balance (p) and
// the lifetime tally (tp) atomically, then zeroes the cycle so the
// next idle window opens a fresh one. The click Lua (clicker.lua) only
// banks into apc/apv during simulation — points stay put until claim
// fires here. That's what makes the modal's "+N reward" line up with
// a real balance change; an older revision credited during sim and
// turned this script into a confusing no-op for the player.
//
// Idempotent: a double-tap on Continue reads apv=0 and is a clean
// no-op (returns the current p/tp untouched). The return tuple still
// surfaces the most recent (apc, apv, p, tp) so the racy second click
// can render its summary.
//
// Level-up signal: claim is the moment tp jumps by `apv`. If that push
// crosses `nl` (the next-level threshold), `level_up_due` rides back so
// the engine can run the standard flush + meta refresh. Without this,
// the player would have to make a manual click to trigger the bump
// even though they already qualified.
//
// Returns: { code, claimed_count, claimed_value, points_after,
//            total_points, level_up_due, dbg_lc_before, dbg_as_before,
//            dbg_ac_before }
//   code = 0 → ok (always; even when nothing was pending)
//   code = 1 → meta missing; caller bootstraps & retries
export const CLAIM_AUTO_LUA = `
local ukey = KEYS[1]
local dkey = KEYS[2]
local user = ARGV[1]
local now  = tonumber(ARGV[2]) or 0

local p_raw = redis.call('HGET', ukey, 'p')
if p_raw == false or p_raw == nil then
  return {1, 0, 0, 0, 0, 0, 0, 0, 0}
end

local apc = tonumber(redis.call('HGET', ukey, 'apc')) or 0
local apv = tonumber(redis.call('HGET', ukey, 'apv')) or 0
local tp  = tonumber(redis.call('HGET', ukey, 'tp')) or 0
local nl  = tonumber(redis.call('HGET', ukey, 'nl')) or 0
local points = tonumber(p_raw) or 0
-- Diagnostic snapshot of cycle-tracking fields BEFORE the reset, so
-- the Node-side logger can show the exact (lc, as, ac) that the
-- claim wiped. lc_before is what the 'idle since' view used to read.
local dbg_lc_before = tonumber(redis.call('HGET', ukey, 'lc')) or 0
local dbg_as_before = tonumber(redis.call('HGET', ukey, 'as')) or 0
local dbg_ac_before = tonumber(redis.call('HGET', ukey, 'ac')) or 0

-- Credit the bank into the spendable + lifetime balance. Both move by
-- exactly apv — apc is a count, not a point value, so it doesn't
-- contribute. Negative apv would underflow the balance; clamp at 0
-- defensively (Lua trusts the value, but it crosses an integer round
-- trip via Redis storage where a corrupt hash field could surface as
-- a string-coerced negative).
if apv > 0 then
  points = points + apv
  tp = tp + apv
end

local lvl_up = 0
if apv > 0 and nl > 0 and tp >= nl then
  lvl_up = 1
end

redis.call('HMSET', ukey,
  'p', tostring(points),
  'tp', tostring(tp),
  'apc', '0',
  'apv', '0',
  'as', '0',
  'ac', '0',
  'lc', tostring(now))

-- Mark dirty whenever the claim mutated the row — both the bank
-- reset AND the credited points/tp need to make it to PG. Without
-- this, a Redis TTL eviction immediately after claim would resurrect
-- the bank from the last flushed snapshot AND lose the credit.
if apv > 0 or apc > 0 then
  redis.call('SADD', dkey, user)
end

return {
  0,
  apc,
  apv,
  points,
  tp,
  lvl_up,
  -- Diagnostic block — see clicker.lua for the rationale. Order MUST
  -- match parseClaimResult() in clicker-redis.service.ts.
  dbg_lc_before,
  dbg_as_before,
  dbg_ac_before
}
`
