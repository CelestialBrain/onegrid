// =============================================================================
// @onegrid/duckdb-join
//
// Cross-source SQL joins via DuckDB-WASM in the browser. Register hetero-
// geneous data sources (Postgres-fetched rows, ClickHouse-fetched rows,
// Mongo docs, plain JS arrays, Arrow IPC byte streams) as DuckDB views
// keyed by name; then run a single SQL query that joins across them.
//
// The use case: an enterprise grid showing orders from Postgres LEFT
// JOINed with customer profiles from MongoDB LEFT JOINed with event
// counts from ClickHouse, all reconciled in the browser in the same
// render frame. DuckDB-WASM runs the join in a Web Worker; the result
// goes through oneGrid's regular DataSource path.
//
// The actual loading from each source is the caller's responsibility —
// this package owns the bridging to DuckDB tables.
// =============================================================================

import type {
  AsyncDuckDB,
  AsyncDuckDBConnection,
} from '@duckdb/duckdb-wasm';

// -----------------------------------------------------------------------------
// Source-registration shapes
// -----------------------------------------------------------------------------

/** @beta */
export interface RowsSource {
  readonly kind: 'rows';
  /** View name inside DuckDB. */
  readonly name: string;
  /** Rows as JS objects. Schema inferred from the first row's keys. */
  readonly rows: ReadonlyArray<Readonly<Record<string, unknown>>>;
}

/** @beta */
export interface ArrowBytesSource {
  readonly kind: 'arrow';
  readonly name: string;
  /** A serialized Arrow IPC stream. Registered via `db.registerFileBuffer`. */
  readonly bytes: Uint8Array;
}

/** @beta */
export interface SqlSource {
  readonly kind: 'sql';
  readonly name: string;
  /** A SELECT or VALUES statement that becomes a view body. */
  readonly query: string;
}

/** @beta */
export type JoinSource = RowsSource | ArrowBytesSource | SqlSource;

// -----------------------------------------------------------------------------
// Registration
// -----------------------------------------------------------------------------

/**
 * Register a JoinSource as a DuckDB view. After this returns, the source
 * is queryable as `SELECT * FROM <name>`.
 *
 *   - `rows`  — emits VALUES (...) inline. Cheap for ≤ 1k rows; for
 *               larger sets, materialize to Arrow first.
 *   - `arrow` — installs the bytes via `registerFileBuffer` + a
 *               `read_parquet` / `read_csv` is NOT applicable; we use
 *               `read_arrow` semantics by registering as a file and
 *               creating a VIEW that reads from it.
 *   - `sql`   — wraps an arbitrary SELECT in CREATE OR REPLACE VIEW.
 * @beta
 */
export async function registerSource(
  db: AsyncDuckDB,
  source: JoinSource,
): Promise<void> {
  const conn = await db.connect();
  try {
    if (source.kind === 'sql') {
      await conn.query(
        `CREATE OR REPLACE VIEW "${escapeIdent(source.name)}" AS ${source.query}`,
      );
      return;
    }
    if (source.kind === 'arrow') {
      const fileName = `__og_join_${source.name}.arrow`;
      await db.registerFileBuffer(fileName, source.bytes);
      await conn.query(
        `CREATE OR REPLACE VIEW "${escapeIdent(source.name)}" AS SELECT * FROM read_arrow('${fileName}')`,
      );
      return;
    }
    // rows
    if (source.rows.length === 0) {
      // Empty source — emit an empty view with no columns. Callers
      // typically pre-filter against this.
      await conn.query(
        `CREATE OR REPLACE VIEW "${escapeIdent(source.name)}" AS SELECT NULL WHERE FALSE`,
      );
      return;
    }
    const cols = Object.keys(source.rows[0]!);
    const values = source.rows
      .map((row) => `(${cols.map((c) => sqlLiteral(row[c])).join(', ')})`)
      .join(', ');
    const colList = cols.map((c) => `"${escapeIdent(c)}"`).join(', ');
    await conn.query(
      `CREATE OR REPLACE VIEW "${escapeIdent(source.name)}" AS SELECT * FROM (VALUES ${values}) AS t(${colList})`,
    );
  } finally {
    await conn.close();
  }
}

/**
 * Drop a previously-registered view (and its file buffer if any).
 * @beta
 */
export async function unregisterSource(
  db: AsyncDuckDB,
  source: JoinSource,
): Promise<void> {
  const conn = await db.connect();
  try {
    await conn.query(`DROP VIEW IF EXISTS "${escapeIdent(source.name)}"`);
  } finally {
    await conn.close();
  }
  if (source.kind === 'arrow') {
    const fileName = `__og_join_${source.name}.arrow`;
    // dropFile / unregisterFileBuffer is best-effort; not all DuckDB
    // versions expose it.
    const dropper = (db as unknown as { dropFile?: (n: string) => Promise<void> }).dropFile;
    if (dropper) await dropper.call(db, fileName);
  }
}

// -----------------------------------------------------------------------------
// JoinQuery — execute a join across registered sources
// -----------------------------------------------------------------------------

/** @beta */
export interface JoinQueryOptions {
  readonly db: AsyncDuckDB;
  readonly sources: ReadonlyArray<JoinSource>;
  /** SQL referencing the registered source names. */
  readonly query: string;
}

/** @beta */
export interface JoinQueryResult {
  readonly rows: ReadonlyArray<Readonly<Record<string, unknown>>>;
  readonly columns: ReadonlyArray<string>;
  /** Wall-clock milliseconds the join (register + query) took. */
  readonly elapsedMs: number;
}

/**
 * Register every source, run the join, return rows as plain JS objects.
 * Sources are dropped after the query completes — call `registerSource`
 * directly if you want long-lived views.
 * @beta
 */
export async function executeJoinQuery(
  opts: JoinQueryOptions,
): Promise<JoinQueryResult> {
  const t0 = nowMs();
  for (const s of opts.sources) await registerSource(opts.db, s);
  let conn: AsyncDuckDBConnection | null = null;
  try {
    conn = await opts.db.connect();
    const result = await conn.query(opts.query);
    const rows: Array<Record<string, unknown>> = [];
    for (const row of result.toArray()) {
      rows.push(Object.fromEntries(Object.entries(row)));
    }
    const columns = result.schema.fields.map((f: { name: string }) => f.name);
    return { rows, columns, elapsedMs: nowMs() - t0 };
  } finally {
    if (conn) await conn.close();
    for (const s of opts.sources) await unregisterSource(opts.db, s).catch(() => {});
  }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function escapeIdent(name: string): string {
  return name.replace(/"/g, '""');
}

function sqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'bigint') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v instanceof Date) return `TIMESTAMP '${v.toISOString()}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
