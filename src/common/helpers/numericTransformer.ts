import { ValueTransformer } from 'typeorm'

// Postgres `numeric` / `decimal` columns arrive from the `pg` driver as strings
// to preserve precision. Without a transformer, JS code on top would do string
// concatenation (`"10" + 5 === "105"`) instead of math. This converts back to
// `number` on read while passing values through unchanged on write.
//
// `null` and `undefined` are preserved (important for nullable columns) — the
// previous version returned `NaN` for them, which silently corrupted reads
// from rows where the field was never set.
export const numericTransformer: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null | undefined): number | null => {
    if (value === null || value === undefined) {
      return null
    }
    const parsed = parseFloat(value)

    return Number.isFinite(parsed) ? parsed : null
  },
}
