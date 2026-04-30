// Parser for Steam Market hash names.
//
// Steam encodes the entire variant identity in `market_hash_name`. Our
// DB keeps each variant as its own row (one per StatTrak / Souvenir /
// exterior combination — that's how the market itself models them),
// and we want UI grouping by base item (weapon + skin name) without
// re-parsing on every render. The sync service runs every name through
// here once and persists the parsed parts as columns.
//
// Formats this handles (CS-side):
//   "AK-47 | Asiimov (Factory New)"
//   "StatTrak™ AK-47 | Asiimov (Field-Tested)"
//   "Souvenir AWP | Dragon Lore (Factory New)"
//   "★ M9 Bayonet | Doppler (Factory New)"            ← knife star prefix
//   "★ StatTrak™ Karambit | Fade (Factory New)"
//   "Sticker | Player (Foil) | Stockholm 2021"        ← stickers / agents have no exterior
//   "Music Kit | AWOLNATION, I Am"                    ← music kits
//   "Operation Bravo Case"                            ← cases (containers) — no '|'
//
// The parser stays format-agnostic where possible: regex with optional
// groups instead of branchy if/else. Items that don't match the
// "weapon | skin (exterior)" shape return what we *can* extract (e.g.
// just `weapon` for cases, or null fields for unparseable names) — the
// caller decides what to do with partial data.
//
// Phase (Doppler P1/P2/P3/P4/Ruby/Sapphire/Black Pearl) is **not** in
// `market_hash_name` on Steam Market — it's tracked separately via
// paint_index in DMarket / our existing `pattern` column. Out of scope
// here.

export interface ParsedHashName {
  weapon: string | null
  skin_name: string | null
  exterior: string | null
  is_stattrak: boolean
  is_souvenir: boolean
}

const STATTRAK_PREFIX = 'StatTrak™' // "StatTrak™" — non-ASCII trademark sign
const SOUVENIR_PREFIX = 'Souvenir'
const KNIFE_STAR = '★' // "★" — knife marker, ignored for matching purposes

// Single parse — returns parsed fields or all-null if the format
// doesn't match. Keeps allocation low: no array of intermediate
// strings, just direct slicing.
export const parseHashName = (raw: string): ParsedHashName => {
  const result: ParsedHashName = {
    weapon: null,
    skin_name: null,
    exterior: null,
    is_stattrak: false,
    is_souvenir: false,
  }

  if (!raw || typeof raw !== 'string') return result

  let working = raw.trim()

  // Strip prefixes, in the order Steam uses them. Order matters because
  // "★ StatTrak™ Karambit" exists but "StatTrak™ ★ Karambit" doesn't.
  if (working.startsWith(KNIFE_STAR)) {
    working = working.slice(KNIFE_STAR.length).trim()
  }

  if (working.startsWith(STATTRAK_PREFIX)) {
    result.is_stattrak = true
    working = working.slice(STATTRAK_PREFIX.length).trim()
  } else if (working.startsWith(SOUVENIR_PREFIX + ' ')) {
    // Match `Souvenir ` (with space) so we don't false-positive on a
    // (hypothetical) skin literally named "Souvenir-something".
    result.is_souvenir = true
    working = working.slice(SOUVENIR_PREFIX.length).trim()
  }

  // Split on " | " — the canonical separator between weapon, skin, and
  // any further qualifiers (collection / sticker tournament / agent
  // squad). For our purposes only the first two parts matter.
  const parts = working.split(' | ')

  // Items without a separator (cases, music kits without subtitle,
  // some stickers) — keep what we have as `weapon` and bail out so the
  // caller can decide how to display them.
  if (parts.length === 1) {
    result.weapon = parts[0]?.trim() || null
    return result
  }

  result.weapon = parts[0]?.trim() || null

  // Second part may carry the exterior in trailing parens:
  // "Asiimov (Factory New)" → skin_name="Asiimov", exterior="Factory New".
  // Stickers / agents may have additional qualifier parts after; we
  // only need the first one here.
  const skinPart = parts[1]?.trim() ?? ''
  const extMatch = skinPart.match(/^(.+?)\s*\(([^)]+)\)\s*$/)

  if (extMatch) {
    result.skin_name = extMatch[1]?.trim() || null
    result.exterior = extMatch[2]?.trim() || null
  } else {
    result.skin_name = skinPart || null
  }

  return result
}
