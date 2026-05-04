// Ghost-mode diagnostic logger for the clicker system.
//
// Gated on a single env flag — flip on, run a test, flip off. Zero
// runtime cost when disabled (the wrapper short-circuits before
// formatting the message). When enabled, logs every micro-step:
//   • bootstrap    — what was loaded from PG / written to Redis
//   • runClick     — before-state + Lua decisions + after-state
//   • claim        — apc/apv reset with before/after
//   • level-up     — flush + clearMeta + rebootstrap chain
//   • flush cron   — dirty users drained, per-user PG sync
//   • WS in/out    — every client message + server reply
//
// Format is tab-separated key=value so logs are grep-able and ALSO
// visually scannable. Each line starts with `[Clicker]` + a sub-tag
// (`[Clicker][lua]`, `[Clicker][bootstrap]`, etc.) for filtering.
//
// Switch off in prod: leave CLICKER_DEBUG unset (default falsy). The
// `enabled()` check is read on every call (NOT cached at import) so
// flipping the env without restarting picks up — useful when the bug
// only reproduces after some uptime.

const isEnabled = (): boolean => {
  const raw = process.env.CLICKER_DEBUG
  if (!raw) return false
  const lower = raw.trim().toLowerCase()
  return lower === '1' || lower === 'true' || lower === 'yes' || lower === 'on'
}

/**
 * Log one event. When disabled, returns immediately — no string
 * formatting, no I/O. When enabled, emits one line to stdout via
 * console.log so it interleaves naturally with NestJS Logger output.
 */
export function clickerLog(tag: string, fields: Record<string, unknown>): void {
  if (!isEnabled()) return

  const parts: string[] = []
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue
    parts.push(`${k}=${formatValue(v)}`)
  }

  // eslint-disable-next-line no-console
  console.log(`[Clicker][${tag}] ${parts.join('  ')}`)
}

/**
 * Two-section log: a top line with primary identity (op, user) and
 * indented blocks underneath for verbose detail. Used by the engine
 * service to keep before/after diffs aligned.
 */
export function clickerLogBlock(
  tag: string,
  header: Record<string, unknown>,
  blocks: Array<[string, Record<string, unknown>]>,
): void {
  if (!isEnabled()) return

  const headerParts: string[] = []
  for (const [k, v] of Object.entries(header)) {
    if (v === undefined) continue
    headerParts.push(`${k}=${formatValue(v)}`)
  }

  // eslint-disable-next-line no-console
  console.log(`[Clicker][${tag}] ${headerParts.join('  ')}`)
  for (const [label, body] of blocks) {
    const bodyParts: string[] = []
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue
      bodyParts.push(`${k}=${formatValue(v)}`)
    }
    // eslint-disable-next-line no-console
    console.log(`  ${label}: ${bodyParts.join('  ')}`)
  }
}

function formatValue(v: unknown): string {
  if (v === null) return 'null'
  if (typeof v === 'number') {
    // Big timestamps render as ms-since-epoch — keep them whole, no
    // scientific notation.
    if (Number.isFinite(v)) return String(Math.trunc(v) === v ? v : v.toFixed(3))
    return String(v)
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'string') return v
  return JSON.stringify(v)
}

/**
 * Used by code paths that compute potentially-expensive log payloads
 * (e.g. fetching extra DB rows just for the log). Lets the caller
 * skip the work entirely when debug is off.
 */
export function isClickerDebugEnabled(): boolean {
  return isEnabled()
}
