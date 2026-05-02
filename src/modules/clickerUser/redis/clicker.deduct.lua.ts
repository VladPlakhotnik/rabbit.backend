// Atomic point-deduction for clicker side-spends (case opens, future shop).
//
// Why a dedicated script: piggy-backing on the Postgres UPDATE path would
// race with the cron flush — between `SELECT points` and `UPDATE points - cost`
// a flush could overwrite the row with stale Redis state, refunding the
// player. Doing the deduction inside Redis (and letting the next cron tick
// flush the new value to Postgres) keeps the source of truth aligned.
//
// Returns:
//    new balance         (≥ 0)  on success
//    -1                          insufficient funds
//    -2                          state not loaded (caller must bootstrap)
export const DEDUCT_LUA = `
local key   = KEYS[1]
local dkey  = KEYS[2]
local user  = ARGV[1]
local cost  = tonumber(ARGV[2]) or 0

local pts_raw = redis.call('HGET', key, 'p')
if pts_raw == false or pts_raw == nil then
  return -2
end

local p = tonumber(pts_raw) or 0
if p < cost then return -1 end

p = p - cost
redis.call('HSET', key, 'p', p)
redis.call('SADD', dkey, user)
return p
`
