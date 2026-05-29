// =============================================================================
// @onegrid/introspect
//
// Schema introspection helpers — turn a protocol Schema, a SQL data-
// type list, or an ORM model into renderable ColumnDef[]. Last item
// in the v0.0.8 milestone because it composes on top of the
// adapters (you can't introspect a schema you don't have).
//
// Depends only on @onegrid/protocol so it can be used by adapter
// packages without pulling in the canvas renderer.
//
// The `MinimalColumnDef` shape is structurally compatible with
// `ColumnDef` from @onegrid/core — consumers cast as needed.
// =============================================================================

import type { ColumnSchema, ColumnType, Schema } from '@onegrid/protocol';

/** Subset of ColumnDef the introspector emits. Structurally
 *  compatible with `@onegrid/core`'s ColumnDef so consumers can
 * @public
 *  cast directly. */
export interface MinimalColumnDef {
  readonly id: string;
  readonly width: number;
  readonly displayName?: string;
  readonly format?: (value: unknown, rowIndex: number) => string;
  readonly color?: (value: unknown, rowIndex: number) => string | undefined;
}

/** @public */
export interface InferColumnsOptions {
  /** Default column width when no per-column override applies. */
  readonly defaultWidth?: number;
  /** Per-column width overrides keyed by column id. */
  readonly widths?: Readonly<Record<string, number>>;
  /** Override the formatter for a column. */
  readonly formatters?: Readonly<
    Record<string, (value: unknown, rowIndex: number) => string>
  >;
  /** Override the displayName for a column (default: id). */
  readonly displayNames?: Readonly<Record<string, string>>;
  /** Skip these column ids entirely. Useful for hiding internal
   *  fields like `tenant_id` or audit columns. */
  readonly skip?: ReadonlyArray<string>;
}

/**
 * Map a protocol `Schema` into a renderable `MinimalColumnDef[]`.
 * Default widths track column type — strings get 160, numerics
 * 120, dates / booleans 100, ids 80. Override per-column via
 * `opts.widths`.
 * @public
 */
export function columnsFromSchema(
  schema: Schema,
  opts: InferColumnsOptions = {},
): MinimalColumnDef[] {
  const skip = new Set(opts.skip ?? []);
  return schema
    .filter((col) => !skip.has(col.id))
    .map((col) => columnFromSchemaEntry(col, opts));
}

function columnFromSchemaEntry(
  col: ColumnSchema,
  opts: InferColumnsOptions,
): MinimalColumnDef {
  const width =
    opts.widths?.[col.id] ?? opts.defaultWidth ?? defaultWidthFor(col.type, col.id);
  const displayName =
    opts.displayNames?.[col.id] ?? col.displayName ?? humanize(col.id);
  const format =
    opts.formatters?.[col.id] ?? defaultFormatterFor(col.type);
  return {
    id: col.id,
    width,
    displayName,
    ...(format ? { format } : {}),
  };
}

/**
 * Map a SQL `data_type` name (from `information_schema.columns` or
 * SQLite `pragma_table_info`) to the protocol's `ColumnType`. Used
 * by the database-introspection helpers below.
 * @public
 */
export function columnTypeFromSql(dataType: string): ColumnType {
  const t = dataType.toLowerCase().trim();
  // Order matters — `int` matches before `bigint`, etc.
  if (t.includes('bigint') || t === 'int8') return 'int64';
  if (t.includes('smallint') || t === 'int2') return 'int16';
  if (t === 'tinyint' || t === 'int1') return 'int8';
  if (t.includes('int')) return 'int32';
  if (t === 'uint64' || t === 'uint32' || t.startsWith('uint')) {
    if (t.includes('64')) return 'uint64';
    if (t.includes('32')) return 'uint32';
    if (t.includes('16')) return 'uint16';
    return 'uint8';
  }
  if (t.includes('double') || t === 'real' || t === 'float8') return 'float64';
  if (t.includes('float') || t === 'float4') return 'float32';
  if (t.includes('numeric') || t.includes('decimal')) return 'decimal';
  if (t.includes('bool')) return 'bool';
  if (
    (t.includes('timestamp') || t.includes('datetime')) &&
    (t.includes('tz') || t.includes('with time zone'))
  ) {
    return 'timestamp_tz';
  }
  if (t.includes('timestamp') || t.includes('datetime')) return 'timestamp';
  if (t.includes('date')) return 'date32';
  if (t.includes('time')) return 'time64';
  if (t.includes('json')) return 'json';
  if (t === 'bytea' || t.includes('blob') || t === 'binary' || t.startsWith('varbinary')) {
    return 'binary';
  }
  if (
    t.includes('char') ||
    t.includes('text') ||
    t === 'string' ||
    t.includes('uuid') ||
    t.includes('enum')
  ) {
    return 'utf8';
  }
  return 'unknown';
}

/**
 * Build a `Schema` from `information_schema.columns`-style rows.
 * Works against Postgres / MySQL identically; SQLite has its own
 * `pragma_table_info` shape mapped via `schemaFromSqliteRows`.
 * @public
 */
export function schemaFromSqlRows(
  rows: ReadonlyArray<{
    column_name: string;
    data_type: string;
    is_nullable?: string | boolean;
  }>,
): Schema {
  return rows.map((r) => {
    const isNullable =
      r.is_nullable === true ||
      r.is_nullable === 'YES' ||
      r.is_nullable === 'yes' ||
      r.is_nullable === 'true';
    return {
      id: r.column_name,
      type: columnTypeFromSql(r.data_type),
      ...(isNullable ? { nullable: true as const } : {}),
    };
  });
}

/**
 * Build a `Schema` from SQLite's `PRAGMA table_info(table)` rows.
 * The `notnull` field is `0` (nullable) or `1` (not nullable).
 * @public
 */
export function schemaFromSqliteRows(
  rows: ReadonlyArray<{
    name: string;
    type: string;
    notnull: number;
  }>,
): Schema {
  return rows.map((r) => ({
    id: r.name,
    type: columnTypeFromSql(r.type),
    ...(r.notnull === 0 ? { nullable: true as const } : {}),
  }));
}

// -----------------------------------------------------------------------------
// Default widths / formatters
// -----------------------------------------------------------------------------

function defaultWidthFor(type: ColumnType, id: string): number {
  // Heuristic: id-shaped columns are usually narrow.
  if (id === 'id' || id.endsWith('_id') || id === '_id') return 80;
  switch (type) {
    case 'bool':
      return 80;
    case 'int8':
    case 'int16':
    case 'int32':
    case 'int64':
    case 'uint8':
    case 'uint16':
    case 'uint32':
    case 'uint64':
    case 'float32':
    case 'float64':
    case 'decimal':
      return 120;
    case 'date32':
    case 'date64':
    case 'timestamp':
    case 'timestamp_tz':
    case 'time32':
    case 'time64':
      return 160;
    case 'utf8':
    case 'json':
      return 200;
    case 'binary':
      return 140;
    default:
      return 160;
  }
}

function defaultFormatterFor(
  type: ColumnType,
): ((value: unknown, rowIndex: number) => string) | undefined {
  switch (type) {
    case 'bool':
      return (v) => (v === true ? 'true' : v === false ? 'false' : '');
    case 'date32':
    case 'date64':
    case 'timestamp':
    case 'timestamp_tz':
      return (v) => formatDate(v);
    case 'json':
      return (v) =>
        v === null || v === undefined ? '' : JSON.stringify(v);
    case 'binary':
      return (v) => (v instanceof Uint8Array ? `<${String(v.byteLength)} bytes>` : '');
    default:
      return undefined; // renderer's String(value) fallback is fine
  }
}

function formatDate(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    return v.toISOString().slice(0, 19).replace('T', ' ');
  }
  if (typeof v === 'string') {
    // Already-formatted ISO string from JSON-over-the-wire.
    return v.length > 19 ? v.slice(0, 19).replace('T', ' ') : v;
  }
  if (typeof v === 'number') {
    return new Date(v).toISOString().slice(0, 19).replace('T', ' ');
  }
  return String(v);
}

function humanize(id: string): string {
  // snake_case → "Snake Case"; camelCase → "Camel Case".
  return id
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/(?:^|\s)(.)/g, (m) => m.toUpperCase())
    .trim();
}
