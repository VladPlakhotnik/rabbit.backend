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
// One click costs \`cost\` energy and grants \`cost\` points. The script accepts
// as many of the requested clicks as current energy allows and silently
// drops the rest — that is the only rate-limit; energy itself is the cap.
//
// Crit click: \`cc\` = chance percent (0-100). On every accepted click we roll
// a random 1..100; if the roll lands ≤ \`cc\`, that click pays out at 10×.
// The roll is server-side and seeded from Redis microsecond clock — the
// client can't predict the seed and therefore can't pick "lucky" moments to
// click. Multiplier is fixed x10 at the moment, and the bonus is added on
// top of the base reward (so a crit click pays \`cost * 10\` total = base
// \`cost\` + 9× bonus).
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
//   cc  crit_chance_pct     (meta; 0 = skill not unlocked)
//   as  auto-clicker start ts (ms; 0 = not active)
//   ad  auto-clicker duration (sec; 0 = not active)
//   ac  auto-clicker last collected ts (ms; advances every tick)
//   ab  active boost key (string; '' = no active boost)
//   at  active boost expires-at ms (0 = no active boost)
//   ae  active boost effect type ('infinite_energy' | 'multiplier' | '')
//   av  active boost effect value (multiplier scalar; 0 for inf-energy)
//
// Auto-clicker model: lazy collection. While \`as\`/\`ad\`/\`ac\` are non-zero
// and \`now < as + ad*1000\`, every tick computes \`floor((min(now, expiry) -
// ac) / 1000)\` accumulated seconds, awards 1 click per second at the
// CURRENT cost (the player paid energy upgrades, the autoclicker pays at
// today's rate), and advances \`ac\`. Past expiry the trio resets to 0 so
// the next tick is a no-op. No server-side timer needed.
//
// Returns: { code, accepted, points, energy, max_energy, cost, level_id,
//            click_level_id, energy_level_id, level_up_due, regen_milli,
//            crit_count, auto_clicks }
//   code = 0 → applied
//   code = 1 → meta missing; caller must lazy-load and retry
//   level_up_due = 1 → caller should immediately flush + rebump.
//   regen_milli is energy units per 1000 ms — surfaced so the client can
//   locally extrapolate energy regeneration between server round-trips.
//   crit_count = number of accepted manual clicks that landed a crit.
//                Crit rolls on auto-clicks fold into points but are NOT
//                counted here — the frontend uses crit_count to mark
//                actual cursor-spawn effects, which only exist for
//                manual taps.
//   auto_clicks = number of seconds the autoclicker collected this tick.
export const CLICK_LUA = `
local ukey  = KEYS[1]
local dkey  = KEYS[2]
local user  = ARGV[1]
local req   = tonumber(ARGV[2]) or 0
local now   = tonumber(ARGV[3]) or 0

local h = redis.call('HMGET', ukey,
  'p','e','t','c','m','r','l','cl','el','nl','cc','as','ad','ac','at','ae','av')

local cost_raw = h[4]
if cost_raw == false or cost_raw == nil then
  -- meta absent → user not bootstrapped (or meta cleared post-upgrade).
  return {1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0}
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
local crit_chance = tonumber(h[11]) or 0
local ac_start    = tonumber(h[12]) or 0
local ac_dur      = tonumber(h[13]) or 0
local ac_last     = tonumber(h[14]) or 0
local boost_at    = tonumber(h[15]) or 0
local boost_ae    = h[16] or ''
local boost_av    = tonumber(h[17]) or 0
if cost < 1 then cost = 1 end
if crit_chance < 0 then crit_chance = 0 end
if crit_chance > 100 then crit_chance = 100 end

-- Active-boost detection. Lazy clear past the deadline so a CRON
-- outage can't leave the buff "running forever".
local boost_active = boost_at > 0 and now < boost_at
if boost_at > 0 and now >= boost_at then
  redis.call('HMSET', ukey, 'ab', '', 'at', '0', 'ae', '', 'av', '0')
end
local infinite_energy = boost_active and boost_ae == 'infinite_energy'
local multiplier = 1
if boost_active and boost_ae == 'multiplier' and boost_av > 1 then
  multiplier = boost_av
end

if regen > 0 and now > last_ts and energy < max_e then
  energy = math.min(max_e, energy + math.floor((now - last_ts) * regen / 1000))
end
if energy < 0 then energy = 0 end
if energy > max_e then energy = max_e end

if req < 0 then req = 0 end
-- Infinite-energy boost: every requested click goes through, no energy
-- gate. Otherwise the energy budget caps acceptance as before.
local accepted
if infinite_energy then
  accepted = req
else
  accepted = math.min(req, math.floor(energy / cost))
end
if accepted < 0 then accepted = 0 end

-- Auto-clicker collection — runs INDEPENDENTLY of manual clicks. The
-- player can be sitting idle (req=0) and still rack up auto clicks.
local auto_clicks = 0
if ac_start > 0 and ac_dur > 0 then
  local expires_at = ac_start + ac_dur * 1000
  local effective = now
  if effective > expires_at then effective = expires_at end
  if effective > ac_last then
    local elapsed_ms = effective - ac_last
    if elapsed_ms >= 1000 then
      auto_clicks = math.floor(elapsed_ms / 1000)
      ac_last = ac_last + auto_clicks * 1000
    end
  end
  -- Past expiry → null out so future ticks short-circuit. Done in
  -- the same script so a CRON outage can't leave the auto-clicker
  -- "running forever" in Redis state.
  if now >= expires_at then
    redis.call('HMSET', ukey, 'as', '0', 'ad', '0', 'ac', '0')
  elseif auto_clicks > 0 then
    redis.call('HSET', ukey, 'ac', tostring(ac_last))
  end
end

-- Crit rolls happen server-side. Seed is the microsecond half of redis
-- TIME — the client doesn't know it and therefore can't time the click
-- to land on a known-good seed. We do TWO independent rolls:
--   1. on accepted manual clicks: counts toward crit_count (the
--      number returned to the client so it can highlight the matching
--      cursor-spawned effects);
--   2. on auto_clicks collected this tick: folds into points but
--      is NOT exposed in crit_count. Auto clicks have no on-screen
--      cursor effect, so attributing them to UI animations would be
--      misleading.
local crit_count = 0
local auto_crit = 0
if (accepted + auto_clicks) > 0 and crit_chance > 0 then
  local t = redis.call('TIME')
  math.randomseed((tonumber(t[2]) or now) + accepted + auto_clicks)
  for i = 1, accepted do
    if math.random(1, 100) <= crit_chance then
      crit_count = crit_count + 1
    end
  end
  for i = 1, auto_clicks do
    if math.random(1, 100) <= crit_chance then
      auto_crit = auto_crit + 1
    end
  end
end

local total_clicks = accepted + auto_clicks
if total_clicks > 0 then
  -- Energy debit:
  --   - autoclicker pays no energy (skill design),
  --   - infinite-energy boost makes manual clicks free too,
  --   - everything else: manual clicks cost cost-each.
  if accepted > 0 and not infinite_energy then
    energy = energy - accepted * cost
  end
  -- Multiplier scales BOTH the base reward and the crit bonus. Crit
  -- damage = base × multiplier × 10, so a crit during x10 boost pays
  -- 100× the per-click cost, which is the documented intent.
  points = points
    + total_clicks * cost * multiplier
    + (crit_count + auto_crit) * 9 * cost * multiplier
  redis.call('HMSET', ukey, 'p', points, 'e', energy, 't', now)
  redis.call('SADD', dkey, user)
else
  -- No manual / no auto — still persist the regen result so the next
  -- call doesn't recompute from scratch.
  redis.call('HMSET', ukey, 'e', energy, 't', now)
end

local lvl_up = 0
if total_clicks > 0 and ncost > 0 and points >= ncost then
  lvl_up = 1
end

return {0, accepted, points, energy, max_e, cost, lvl, clvl, elvl, lvl_up, regen, crit_count, auto_clicks}
`
