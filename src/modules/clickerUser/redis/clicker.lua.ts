// Atomic clicker engine.
//
// Why Lua: every click is a check-and-mutate against energy/points and we run
// many concurrent sockets per user (multi-tab, autoclickers). Sequencing this
// in NestJS would require a per-user mutex; Lua runs server-side under
// Redis's single-threaded executor, so the whole script is one atomic unit.
//
// All user data is stored in ONE hash key per user. Hosted Redis providers
// (Redis Cloud, Upstash) bill per inner Redis command — collapsing 4 keys
// (points / energy / ts / meta) into a single hash means a click runs:
//     HMGET (1) + HMSET (1) + SADD (1, only when accepted > 0)
//   = 2-3 ops per call instead of the previous ~13.
//
// One click costs `cost` energy and grants `cost` points. The script accepts
// as many of the requested clicks as current energy allows and silently
// drops the rest — that is the only rate-limit; energy itself is the cap.
//
// Hash fields (short names to keep HMGET / HMSET payload small):
//   p   points              (state)
//   e   energy              (state)
//   t   last regen ts (ms)  (state)
//   c   cost = reward       (meta)
//   m   max_energy          (meta)
//   r   regen / sec * 1000  (meta)
//   l   bunny level_id      (meta)
//   cl  click_level_id      (meta)
//   el  energy_level_id     (meta)
//   nl  next_level_cost     (meta; 0 = at max level)
//
// Returns: { code, accepted, points, energy, max_energy, cost, level_id,
//            click_level_id, energy_level_id, level_up_due, regen_milli }
//   code = 0 → applied
//   code = 1 → meta missing; caller must lazy-load and retry
//   level_up_due = 1 → caller should immediately flush + rebump.
//   regen_milli is energy units per 1000 ms — surfaced so the client can
//   locally extrapolate energy regeneration between server round-trips.
export const CLICK_LUA = `
local ukey  = KEYS[1]
local dkey  = KEYS[2]
local user  = ARGV[1]
local req   = tonumber(ARGV[2]) or 0
local now   = tonumber(ARGV[3]) or 0

local h = redis.call('HMGET', ukey,
  'p','e','t','c','m','r','l','cl','el','nl')

local cost_raw = h[4]
if cost_raw == false or cost_raw == nil then
  -- meta absent → user not bootstrapped (or meta cleared post-upgrade).
  return {1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0}
end

local points  = tonumber(h[1]) or 0
local energy  = tonumber(h[2]) or 0
local last_ts = tonumber(h[3]) or now
local cost    = tonumber(cost_raw) or 1
local max_e   = tonumber(h[5]) or 0
local regen   = tonumber(h[6]) or 0
local lvl     = tonumber(h[7]) or 0
local clvl    = tonumber(h[8]) or 0
local elvl    = tonumber(h[9]) or 0
local ncost   = tonumber(h[10]) or 0
if cost < 1 then cost = 1 end

if regen > 0 and now > last_ts and energy < max_e then
  energy = math.min(max_e, energy + math.floor((now - last_ts) * regen / 1000))
end
if energy < 0 then energy = 0 end
if energy > max_e then energy = max_e end

if req < 0 then req = 0 end
local accepted = math.min(req, math.floor(energy / cost))
if accepted < 0 then accepted = 0 end

if accepted > 0 then
  energy = energy - accepted * cost
  points = points + accepted * cost
  redis.call('HMSET', ukey, 'p', points, 'e', energy, 't', now)
  redis.call('SADD', dkey, user)
else
  -- Still persist the regen result so the next call doesn't recompute from scratch.
  redis.call('HMSET', ukey, 'e', energy, 't', now)
end

local lvl_up = 0
if accepted > 0 and ncost > 0 and points >= ncost then
  lvl_up = 1
end

return {0, accepted, points, energy, max_e, cost, lvl, clvl, elvl, lvl_up, regen}
`
