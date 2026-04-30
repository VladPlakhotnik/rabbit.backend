import type { Repository, ObjectLiteral } from 'typeorm'

// Single-statement batched metadata UPDATE for skin entities.
//
// The catalog sync used to apply DMarket metadata one row at a time
// (~50 ms per `repo.update()` × 39 rows per page × ~680 pages = ~22 min
// of pure DB chatter). The earlier code comment listed the alternatives
// that didn't work — `repo.save([...])` deadlocked itself, `repo.upsert`
// failed NOT NULL validation on the INSERT-conflict path. The third
// option, **not** tried at the time, is what this helper does:
//
//   UPDATE table SET col = COALESCE(v.col, table.col), …, updated_at = NOW()
//     FROM (VALUES ($1::int, $2::text, …), ($N+1, $N+2, …), …)
//     AS v(id, col1, col2, …)
//     WHERE table.id = v.id;
//
// Why COALESCE: each per-row update only carries fields DMarket actually
// returned for that listing (image but no exterior, exterior but no
// image, etc.). COALESCE preserves the existing value when the input is
// NULL, so a row that lacks a field doesn't clobber what's already on
// disk. Same semantics as the previous loop, just one round-trip.
//
// Why explicit `::type` casts on the *first* VALUES row only: PostgreSQL
// infers column types from the first VALUES tuple. Without casts it
// would default polymorphic NULLs to `text` and fail when a later row
// supplies a real number / int / array. Casting once on row 0 fixes the
// types for the whole VALUES expression.
//
// NOT NULL columns: existing rows always satisfy them (the constraint
// itself guarantees it), so COALESCE(NULL_input, NOT_NULL_existing)
// always resolves to a non-null value. The constraint is never
// violated by this pattern as long as we never delete the row's
// existing value before the UPDATE.
//
// `updated_at = NOW()` is added unconditionally so the
// `@UpdateDateColumn()` semantics from TypeORM are preserved when we
// bypass the ORM with raw SQL. Without it, downstream tooling that
// watches `updated_at` (admin "last touched", incremental exports)
// would see stale timestamps.

// Identifiers are interpolated, so they MUST be hard-coded constants
// in the call sites — never derived from user input. We still validate
// at runtime as defence-in-depth.
const SAFE_SQL_IDENTIFIER = /^[a-z_][a-z0-9_]*$/i
const SAFE_SQL_TYPE_PATTERN = /^[a-z_][a-z0-9_ ]*(\[\])?$/i

export interface ColumnSpec<T> {
  /** Column name in the SQL table — also the alias inside VALUES. */
  name: string
  /** PostgreSQL type for the explicit cast on the first VALUES row. */
  sqlType: string
  /** Property key on the JS update object that maps to this column. */
  jsKey: keyof T
  /**
   * If true, the column is unconditionally overwritten with the input
   * value (even null). Use for volatile fields that need to reflect
   * the latest source-of-truth value (e.g. `buy_order`, `avg_price`,
   * `popularity_7d`, `volume`, `price`). Default false — non-volatile
   * fields use COALESCE to preserve existing values when input is null.
   */
  overwrite?: boolean
}

const validateIdentifier = (value: string, label: string): void => {
  if (!SAFE_SQL_IDENTIFIER.test(value)) {
    throw new Error(`Unsafe SQL identifier for ${label}: "${value}"`)
  }
}

const validateSqlType = (value: string, label: string): void => {
  if (!SAFE_SQL_TYPE_PATTERN.test(value)) {
    throw new Error(`Unsafe SQL type for ${label}: "${value}"`)
  }
}

/**
 * Apply a batch of partial updates to a table in a single SQL
 * statement. Returns the number of rows the function tried to update
 * (== `updates.length`). The helper assumes every `id` exists in
 * `tableName` — missing IDs are silently skipped by the UPDATE without
 * an error, matching the previous per-row behaviour.
 *
 * Caller contract:
 *   - `tableName` and `columns[].name` MUST be hard-coded constants
 *     (validated against an identifier whitelist).
 *   - Each update object MUST have `id: number`.
 *   - Other fields may be present or absent; absent fields preserve
 *     the existing column value via COALESCE.
 *   - The target table MUST have `id` (int PK) and `updated_at`
 *     (timestamp) columns; both are TypeORM defaults for the skin
 *     entities so this is satisfied implicitly.
 */
export async function applyMetadataUpdatesBatch<
  T extends ObjectLiteral & { id: number },
>(
  repo: Repository<T>,
  tableName: string,
  columns: ReadonlyArray<ColumnSpec<T>>,
  updates: ReadonlyArray<Partial<T> & { id: number }>,
): Promise<number> {
  if (updates.length === 0) return 0

  validateIdentifier(tableName, 'table name')
  for (const col of columns) {
    validateIdentifier(col.name, `column "${col.name}"`)
    validateSqlType(col.sqlType, `column "${col.name}" sqlType`)
  }

  const params: unknown[] = []
  const valueRows: string[] = []

  for (const update of updates) {
    const isFirstRow = valueRows.length === 0
    const placeholders: string[] = []

    params.push(update.id)
    placeholders.push(
      isFirstRow ? `$${params.length}::int` : `$${params.length}`,
    )

    for (const col of columns) {
      // `undefined` (key absent on the partial) and `null` both
      // collapse to SQL NULL — COALESCE then preserves the existing
      // column value. A real value passes through and overwrites.
      const value = update[col.jsKey]
      params.push(value === undefined ? null : value)
      placeholders.push(
        isFirstRow ? `$${params.length}::${col.sqlType}` : `$${params.length}`,
      )
    }

    valueRows.push(`(${placeholders.join(', ')})`)
  }

  const setClauses = [
    ...columns.map((c) =>
      c.overwrite
        ? `${c.name} = v.${c.name}`
        : `${c.name} = COALESCE(v.${c.name}, ${tableName}.${c.name})`,
    ),
    `updated_at = NOW()`,
  ].join(', ')

  const colNames = ['id', ...columns.map((c) => c.name)].join(', ')

  const sql =
    `UPDATE ${tableName} SET ${setClauses} ` +
    `FROM (VALUES ${valueRows.join(', ')}) AS v(${colNames}) ` +
    `WHERE ${tableName}.id = v.id`

  await repo.query(sql, params)

  // We return updates.length rather than the driver's affected-row
  // count: TypeORM's contract for `query()` doesn't guarantee a
  // consistent shape for UPDATE results across drivers, and the
  // caller wants "how many we attempted" for the catalog-sync report.
  // A row whose id is missing from the table would silently drop, but
  // by construction (we built the id list from the same table moments
  // earlier) that can't happen.
  return updates.length
}
