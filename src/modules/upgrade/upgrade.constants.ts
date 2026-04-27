// Single source of truth for upgrade limits. Mirrored on the frontend via the
// `GET /upgrade/limits` endpoint — never duplicate these numbers in client
// code as constants, fetch them from the API.
export const UPGRADE_LIMITS = {
  // Inclusive lower / upper bounds on the rolled chance after the linear
  // formula. Below MIN_CHANCE: "penny-attempt" spam (1₽ material vs 1000₽
  // target). Above MAX_CHANCE: source ≈ target — paid winning, drains
  // the house edge with negligible risk.
  MIN_CHANCE: 1,
  MAX_CHANCE: 80,

  // Inclusive bounds on the source value, in account currency. Applies to
  // both balance mode (`upgrade_amount`) and inventory mode (Σ material
  // prices). Below MIN_AMOUNT the upgrade is economically meaningless;
  // above MAX_AMOUNT it exceeds the per-attempt risk envelope.
  MIN_AMOUNT: 0.5,
  MAX_AMOUNT: 5000,

  // Inventory mode only. MAX_MATERIALS is a technical safety cap — a real
  // player almost never selects 20+ skins; values above protect the server
  // from oversized payloads / heavy row-locking transactions.
  MIN_MATERIALS: 1,
  MAX_MATERIALS: 20,
} as const
