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
//   tp  total_points lifetime tally (state) — bumps on every credit,
//       never decreases. Used by the level-up gate and the progress
//       bar fill. Spending hits `p` only.
//   e   energy              (state)
//   t   last regen ts (ms)  (state)
//   c   cost = reward       (meta)
//   m   max_energy          (meta)
//   r   regen *milli-units* per second (meta) — i.e. (units/sec) * 1000.
//       Stored at 1000× resolution so fractional rates (0.25/sec → 250)
//       survive integer storage. Per-ms accumulation: dt_ms * r / 1_000_000.
//   l   bunny level_id      (meta)
//   cl  click_level_id      (meta)
//   el  energy_level_id     (meta)
//   nl  next_level_cost     (meta; 0 = at max level)
//   cc  crit_chance_pct     (meta; 0 = skill not unlocked)
//   ad  autoclicker max idle seconds (meta; 0 = autoclicker not unlocked).
//       Was "activate duration" in v3 — semantics shifted with the
//       bank model (see top docstring).
//   as  autoclicker accumulation start ms (state; 0 = not currently
//       accumulating). Set lazily once the player has been idle for
//       \`idle_threshold_ms\` and there's no unclaimed bank.
//   ac  autoclicker last simulated tick ms (state; advances by
//       AUTO_TICK_MS each tick).
//   lc  last manual click attempt ms (state; updated after idle sim on req>0).
//       Drives idle detection — autoclicker accumulation kicks in
//       \`idle_threshold_ms\` after this.
//   apc autoclicker pending click count (state). Grows during
//       accumulation, reset to 0 by the claim Lua.
//   apv autoclicker pending click value (state, points). Stored
//       separately from apc so a click-level upgrade between
//       accumulation and claim can't change the payout — apv was
//       computed at simulation time using the cost in effect then.
//   ab  active boost key (string; '' = no active boost)
//   at  active boost expires-at ms (0 = no active boost)
//   ae  active boost effect type ('infinite_energy' | 'multiplier' | '')
//   av  active boost effect value (multiplier scalar; 0 for inf-energy)
//   ib  infinite-energy token bucket balance (state). Limits custom clients
//       from turning the buff into unbounded packet spam.
//   it  infinite-energy token bucket last refill ms (state).
//
// Autoclicker model (replaces v3 "lazy collection" model): the autoclicker
// is an idle-time bank. After the player has been silent for
// \`idle_threshold_ms\` (typically 60s, configurable per-call), it ticks once
// every AUTO_TICK_MS (3 sec). Each tick:
//   - regenerates the 3-sec slice of energy first;
//   - if energy >= cost, debits cost, increments apc by 1, increments apv
//     by cost. Otherwise skips (the regen still happened, so future ticks
//     can resume).
// Accumulation pauses the moment a manual click request lands (lc updates
// after the already-earned idle window is simulated). Cap is \`as + ad*1000\`
// — once the player passes that wall-clock
// instant, no more ticks are credited. Pending stays in apc/apv until the
// player calls the claim script (clicker.lua.claim).
//
// Crediting model: ticks bank into apc/apv but DON'T touch points/tp. The
// claim script flips apv into points and tp atomically — that's what
// makes the modal's "+N reward" line up with a real balance change. An
// older revision credited during sim and treated claim as a dismiss; it
// was confusing UX (modal claimed +200 but balance unchanged) and made
// the level-up gate fire mid-idle when the player wasn't watching.
//
// Returns: { code, accepted, points, energy, max_energy, cost, level_id,
//            click_level_id, energy_level_id, level_up_due, regen_milli,
//            crit_count, auto_credited, ac_start, ac_max_idle_sec,
//            apc, apv, total_points }
//   code = 0 → applied
//   code = 1 → meta missing; caller must lazy-load and retry
//   level_up_due = 1 → caller should immediately flush + rebump.
//   regen_milli is energy units per 1000 ms — surfaced so the client can
//   locally extrapolate energy regeneration between server round-trips.
//   crit_count = number of accepted manual clicks that landed a crit.
//   auto_credited = number of autoclicker ticks credited this Lua call
//                   (NOT cumulative — just this batch). 0 most of the
//                   time; nonzero on the first call after a long idle.
//   ac_start, ac_max_idle_sec → drive the "elapsed since accumulation
//                   started" UI for the claim modal. 0 when not
//                   accumulating.
//   apc, apv → current pending bank. Frontend uses these to render
//              the claim CTA / modal.
//   total_points → lifetime monotonic tally; spending leaves it
//                   untouched. Drives the progress bar fill so the
//                   bar doesn't regress when the player spends.
export const CLICK_LUA = `
local ukey  = KEYS[1]
local dkey  = KEYS[2]
local user  = ARGV[1]
local req   = tonumber(ARGV[2]) or 0
local now   = tonumber(ARGV[3]) or 0
local idle_threshold_ms = tonumber(ARGV[4]) or 60000

local AUTO_TICK_MS = 3000
local INF_ENERGY_RATE_PER_SEC = 20
local INF_ENERGY_BURST = 40

local h = redis.call('HMGET', ukey,
  'p','e','t','c','m','r','l','cl','el','nl','cc',
  'as','ad','ac','ab','at','ae','av',
  'lc','apc','apv','tp','ib','it')

local cost_raw = h[4]
if cost_raw == false or cost_raw == nil then
  -- meta absent → user not bootstrapped (or meta cleared post-upgrade).
  return {1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0}
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
local ac_max_idle = tonumber(h[13]) or 0
local ac_last     = tonumber(h[14]) or 0
local boost_ab    = h[15] or ''
local boost_at    = tonumber(h[16]) or 0
local boost_ae    = h[17] or ''
local boost_av    = tonumber(h[18]) or 0
local lc          = tonumber(h[19]) or 0
local apc         = tonumber(h[20]) or 0
local apv         = tonumber(h[21]) or 0
local tp          = tonumber(h[22]) or 0
local inf_tokens  = tonumber(h[23])
local inf_token_ts = tonumber(h[24]) or now
if inf_tokens == nil then inf_tokens = INF_ENERGY_BURST end
if inf_tokens < 0 then inf_tokens = 0 end
if inf_tokens > INF_ENERGY_BURST then inf_tokens = INF_ENERGY_BURST end

-- Snapshot BEFORE-state for the diagnostic return tuple. Cheap (just
-- locals) and lets the caller log a clean before→after diff without
-- having to fetch the hash twice.
local dbg_p_before    = points
local dbg_e_before    = energy
local dbg_lts_before  = last_ts
local dbg_lc_before   = lc
local dbg_as_before   = ac_start
local dbg_ac_before   = ac_last
local dbg_apc_before  = apc
local dbg_apv_before  = apv
local dbg_tp_before   = tp
if cost < 1 then cost = 1 end
if crit_chance < 0 then crit_chance = 0 end
if crit_chance > 100 then crit_chance = 100 end

-- Active-boost detection. Lazy clear past the deadline so a CRON
-- outage can't leave the buff "running forever".
local boost_active = boost_at > 0 and now < boost_at
if boost_at > 0 and now >= boost_at then
  redis.call('HMSET', ukey, 'ab', '', 'at', '0', 'ae', '', 'av', '0')
  boost_ab = ''
  boost_at = 0
  boost_ae = ''
  boost_av = 0
end
local infinite_energy = boost_active and boost_ae == 'infinite_energy'
local multiplier = 1
if boost_active and boost_ae == 'multiplier' and boost_av > 1 then
  multiplier = boost_av
end

-- Energy regen.
--   regen is stored as (units per sec) * 1000, so:
--     units regenerated = dt_ms * regen / 1_000_000
--   floor() means fractional rates (0.25/sec → regen=250) only tick
--   once ~4000ms have accumulated. We track ms ACTUALLY consumed by the
--   integer ticks, so the sub-unit remainder carries into the next call —
--   without that carry, batched click flushes (every 250ms) would suppress
--   regen entirely at slow rates.
local regen_units = 0
local regen_ms_used = 0
local dbg_outer_regen_dt_ms = 0
local dbg_outer_regen_computed_raw = 0
if regen > 0 and now > last_ts and energy < max_e then
  dbg_outer_regen_dt_ms = now - last_ts
  local computed = math.floor((now - last_ts) * regen / 1000000)
  dbg_outer_regen_computed_raw = computed
  if computed > 0 then
    local headroom = max_e - energy
    if computed > headroom then computed = headroom end
    regen_units = computed
    energy = energy + regen_units
    regen_ms_used = math.floor(regen_units * 1000000 / regen)
  end
end
if energy < 0 then energy = 0 end
if energy > max_e then energy = max_e end

if req < 0 then req = 0 end
local accepted = 0

-- Autoclicker idle accumulation.
--
-- Preconditions:
--   - autoclicker unlocked (ac_max_idle > 0)
--   - the player has crossed the idle threshold. Manual clicks are allowed
--     to collect the idle window that happened BEFORE the click; after the
--     sim below, req>0 stamps lc=now so active click spam cannot keep the
--     idle window open.
--
-- Cycle lifecycle:
--   - First idle: starts a new cycle (apc == 0 gate prevents starting
--     a SECOND cycle before the player claims the first).
--   - Mid-cycle status checks: continue advancing the existing cycle
--     (apc > 0 does NOT block continuation — only new starts).
--   - Cycle ends on claim, which zeroes as/ac/apc/apv and stamps lc.
--
-- Sim window: from max(ac, lc + idle_threshold) — the later of "where
-- we left off" and "earliest idle-confirmed point" — up to
-- min(now, cap_at). The lc-floor is what skips active periods: when
-- the player clicks mid-cycle, lc jumps forward, so the next status
-- check's sim window starts at the new lc + threshold rather than
-- counting the active period as autoclick time.
local auto_credited = 0

-- Diagnostic snapshot of the autoclicker math the Lua chose. All
-- four fields are 0 when the autoclicker block didn't engage at all
-- (e.g. ad=0 or the player has not been idle long enough). When it did engage,
-- they pin down exactly which window was simulated — 'ticks_attempted' is the loop
-- iteration count, 'ticks_succeeded' is how many actually credited
-- (skipped iterations are when energy<cost). dbg_inner_regen_total
-- sums energy regen credited inside the per-tick loop.
local dbg_cap_at = 0
local dbg_effective_now = 0
local dbg_sim_from = 0
local dbg_ticks_attempted = 0
local dbg_ticks_succeeded = 0
local dbg_inner_regen_total = 0
local dbg_ac_started_this_call = 0
local dbg_idle_dt_at_check = 0
if ac_max_idle > 0 then
  -- Clamp negative idle deltas to 0 — a client clock briefly behind the
  -- server (or two parallel calls with mismatched ts) can produce
  -- now < lc. The math below uses (now - lc) >= idle_threshold_ms,
  -- which already guards against negatives, but the diagnostic surface
  -- shouldn't show negatives either (they read as bugs but aren't).
  dbg_idle_dt_at_check = now - lc
  if dbg_idle_dt_at_check < 0 then dbg_idle_dt_at_check = 0 end
  if ac_start == 0 and apc == 0 and lc > 0 and dbg_idle_dt_at_check >= idle_threshold_ms then
    ac_start = lc + idle_threshold_ms
    ac_last = ac_start
    dbg_ac_started_this_call = 1
  end

  if ac_start > 0 then
    local cap_at = ac_start + ac_max_idle * 1000
    local effective_now = now
    if effective_now > cap_at then effective_now = cap_at end
    dbg_cap_at = cap_at
    dbg_effective_now = effective_now

    local idle_floor = lc + idle_threshold_ms
    local sim_from = ac_last
    if sim_from < idle_floor then sim_from = idle_floor end
    dbg_sim_from = sim_from

    -- Per-tick simulation. Common case is solved as a formula when
    -- per-tick regen covers the click cost: all ticks succeed, so we
    -- advance the bank and final energy in O(1). If regen is slower
    -- than the click cost, fall back to the bounded loop because
    -- success cadence depends on the carried energy residue.
    if sim_from < effective_now then
      local attempted = math.floor((effective_now - sim_from) / AUTO_TICK_MS)
      local tick_regen_full = 0
      if regen > 0 then
        tick_regen_full = math.floor(AUTO_TICK_MS * regen / 1000000)
      end

      if attempted > 0 and tick_regen_full >= cost and max_e >= cost then
        dbg_ticks_attempted = dbg_ticks_attempted + attempted
        dbg_ticks_succeeded = dbg_ticks_succeeded + attempted
        dbg_inner_regen_total = dbg_inner_regen_total + attempted * tick_regen_full
        apc = apc + attempted
        apv = apv + attempted * cost
        auto_credited = auto_credited + attempted
        local net_per_tick = tick_regen_full - cost
        local capped_final_energy = max_e - cost
        if capped_final_energy < 0 then capped_final_energy = 0 end
        energy = energy + attempted * net_per_tick
        if energy > capped_final_energy then energy = capped_final_energy end
        if energy < 0 then energy = 0 end
        ac_last = sim_from + attempted * AUTO_TICK_MS
      else
        local tick_at = sim_from + AUTO_TICK_MS
        while tick_at <= effective_now do
          dbg_ticks_attempted = dbg_ticks_attempted + 1
          if regen > 0 and energy < max_e then
            local tick_regen = math.floor(AUTO_TICK_MS * regen / 1000000)
            local headroom = max_e - energy
            if tick_regen > headroom then tick_regen = headroom end
            if tick_regen > 0 then
              energy = energy + tick_regen
              dbg_inner_regen_total = dbg_inner_regen_total + tick_regen
            end
          end
          if energy >= cost then
            energy = energy - cost
            -- Bank only — points/tp stay put. The claim Lua flips apv
            -- into the spendable + lifetime balance atomically when
            -- the player hits Continue. Banking-only here is what lets
            -- the modal's "+N reward" actually change the balance:
            -- crediting during sim made claim a no-op (UX trap) and
            -- could trip the level-up gate while the player was idle.
            apc = apc + 1
            apv = apv + cost
            auto_credited = auto_credited + 1
            dbg_ticks_succeeded = dbg_ticks_succeeded + 1
          end
          ac_last = tick_at
          tick_at = tick_at + AUTO_TICK_MS
        end
      end
    end
  end
end

-- Manual clicks happen after the idle-bank simulation above. This preserves
-- the intuitive "I was away, then tapped once" case: the autoclicker gets the
-- already-earned idle ticks, then the tap becomes the new activity anchor.
-- Infinite-energy boost clicks are free, but still paced by a server-side
-- token bucket.
if infinite_energy then
  if now > inf_token_ts then
    local refill = (now - inf_token_ts) * INF_ENERGY_RATE_PER_SEC / 1000
    if refill > 0 then
      inf_tokens = inf_tokens + refill
      if inf_tokens > INF_ENERGY_BURST then
        inf_tokens = INF_ENERGY_BURST
      end
      inf_token_ts = now
    end
  elseif now < inf_token_ts then
    -- Server time should be monotonic enough for normal operation, but keep
    -- the bucket sane across clock corrections / test harness rewinds.
    inf_token_ts = now
  end
  accepted = math.min(req, math.floor(inf_tokens))
  inf_tokens = inf_tokens - accepted
else
  accepted = math.min(req, math.floor(energy / cost))
end
if accepted < 0 then accepted = 0 end

-- Any manual click request is activity. Do this AFTER autoclicker simulation
-- so the just-finished idle window is not lost, but custom clients cannot
-- keep accruing idle ticks by spamming out-of-energy click attempts.
if req > 0 then
  lc = now
end

-- Crit rolls happen server-side. Seed is the microsecond half of redis
-- TIME — the client doesn't know it and therefore can't time the click
-- to land on a known-good seed. Only the manual-click path rolls crits;
-- the autoclicker pays at base cost (no crits in the bank — keeps
-- claim payouts predictable for the player).
local crit_count = 0
if accepted > 0 and crit_chance > 0 then
  local t = redis.call('TIME')
  math.randomseed((tonumber(t[2]) or now) + accepted)
  for i = 1, accepted do
    if math.random(1, 100) <= crit_chance then
      crit_count = crit_count + 1
    end
  end
end

if accepted > 0 then
  -- Energy debit:
  --   - infinite-energy boost makes manual clicks free,
  --   - everything else: manual clicks cost cost-each.
  if not infinite_energy then
    energy = energy - accepted * cost
  end
  -- Multiplier scales BOTH the base reward and the crit bonus. Crit
  -- damage = base × multiplier × 10, so a crit during x10 boost pays
  -- 100× the per-click cost, which is the documented intent.
  local credit = accepted * cost * multiplier
    + crit_count * 9 * cost * multiplier
  points = points + credit
  -- Lifetime tally tracks all earnings, never dropping. The progress
  -- bar reads from this so spending doesn't visibly demote the player.
  tp = tp + credit
end

-- Persist regen anchor: snap to now when regen is disabled or the bar
-- is full (no carry needed); otherwise advance only by ms that
-- contributed integer regen units, so the sub-unit residual rolls into
-- the next call.
--
-- Autoclicker simulation already accounted for energy during the
-- (sim_from, ac_last) window via inner regen + per-tick debits. Without
-- the second branch below, the next call's outer regen reads
-- (now - last_ts) and re-credits regen for that span — silently
-- inflating energy by ~inner_regen_total per cycle. Anchoring to ac_last
-- when it's ahead of the carried-residual closes the double-count.
local persisted_ts
if regen <= 0 or energy >= max_e then
  persisted_ts = now
else
  persisted_ts = last_ts + regen_ms_used
  if ac_last > persisted_ts then
    persisted_ts = ac_last
  end
end

-- Single HMSET batches every state field that may have changed. Keeping
-- it to one round-trip preserves the per-call op-count budget that
-- justified the unified-hash design in the first place.
redis.call('HMSET', ukey,
  'p', tostring(points),
  'tp', tostring(tp),
  'e', tostring(energy),
  't', tostring(persisted_ts),
  'lc', tostring(lc),
  'as', tostring(ac_start),
  'ac', tostring(ac_last),
  'apc', tostring(apc),
  'apv', tostring(apv),
  'ib', tostring(inf_tokens),
  'it', tostring(inf_token_ts))

-- Mark dirty for the cron flush whenever something the player would
-- notice changed: manual clicks (points/energy moved) OR autoclicker
-- credited a tick (apc/apv grew). Without the autoclicker branch the
-- bank would be Redis-only until the next manual click, which would
-- be lost on a 7-day TTL eviction.
if accepted > 0 or auto_credited > 0 then
  redis.call('SADD', dkey, user)
end

-- Level bump gate reads from the lifetime tally rather than the
-- balance: a player who just crossed the threshold via clicks AND
-- spent some carrots in the same tick should still trigger the bump.
-- Both manual and autoclicker credits can push tp past ncost.
local lvl_up = 0
if (accepted > 0 or auto_credited > 0) and ncost > 0 and tp >= ncost then
  lvl_up = 1
end

return {
  0,
  accepted,
  points,
  energy,
  max_e,
  cost,
  lvl,
  clvl,
  elvl,
  lvl_up,
  regen,
  crit_count,
  auto_credited,
  ac_start,
  ac_max_idle,
  apc,
  apv,
  tp,
  boost_active and boost_ab or '',
  boost_active and boost_at or 0,
  -- Diagnostic block — appended for the Ghost-mode debug logger.
  -- Always returned (cheap inside Redis Lua), but consumed only when
  -- CLICKER_DEBUG=true on the Node side. Order MUST match the
  -- destructuring inside parseClickResult() in clicker-redis.service.ts.
  dbg_p_before,
  dbg_e_before,
  dbg_lts_before,
  dbg_lc_before,
  dbg_as_before,
  dbg_ac_before,
  dbg_apc_before,
  dbg_apv_before,
  dbg_tp_before,
  dbg_outer_regen_dt_ms,
  dbg_outer_regen_computed_raw,
  regen_units,
  regen_ms_used,
  dbg_idle_dt_at_check,
  dbg_ac_started_this_call,
  dbg_cap_at,
  dbg_effective_now,
  dbg_sim_from,
  dbg_ticks_attempted,
  dbg_ticks_succeeded,
  dbg_inner_regen_total
}
`
