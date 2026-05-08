// =============================================================================
// SQLite SQL compiler — translates a BlockRequest into a parameterized
// SELECT against a SQLite table. Pure: no driver dependency, no I/O.
//
// Diverges from @onegrid/postgres at exactly two places:
//   1. Placeholders: `?` instead of `$N` (sqlite uses anonymous
//      positional placeholders by default). Better-sqlite3,
//      node:sqlite, bun:sqlite, and Cloudflare D1 all accept this.
//   2. NULL-handling SUM: SQLite's `SUM` returns NULL on empty
//      groups (matches Postgres). `COALESCE(SUM, 0)` is wrapped
//      around it for consistency with the @onegrid/data aggregator.
//
// Identifier quoting (double quotes), row-tuple comparison
// `(a,b) > (1,2)`, and native NULLS FIRST/LAST in ORDER BY all
// match Postgres. SQLite is dynamically typed so the explicit
// `::int` / `::float` casts the Postgres compiler emits are
// dropped — SQLite's affinity rules handle aggregation result
// types automatically.
// =============================================================================

import type {
  BlockRequest,
  ComparisonOperator,
  FilterNode,
  KeysetCursor,
  SortField,
} from '@onegrid/protocol';

export interface SqliteTableDescriptor {
  /** Schema-qualified table identifier (e.g. `main.orders`) or
   *  bare table name. */
  readonly table: string;
  /** Column ids that exist in the table. */
  readonly columns: ReadonlyArray<string>;
  /** Primary-key column id used as the keyset tiebreaker. */
  readonly primaryKey: string;
}

export interface CompiledQuery {
  readonly sql: string;
  readonly params: ReadonlyArray<unknown>;
}

const KEYSET_PREFIX = 'ks:';

export function compileBlockQuery(
  req: BlockRequest,
  table: SqliteTableDescriptor,
  cursor: KeysetCursor | null,
): CompiledQuery {
  if (req.grouping && req.grouping.columns.length > 0) {
    return compileGroupedQuery(req, table);
  }
  return compileFlatQuery(req, table, cursor);
}

function compileFlatQuery(
  req: BlockRequest,
  table: SqliteTableDescriptor,
  cursor: KeysetCursor | null,
): CompiledQuery {
  const projection = projectColumns(req.columns, table);
  const params: unknown[] = [];

  const whereClauses: string[] = [];
  if (req.filter) {
    whereClauses.push(compileFilter(req.filter, params, table));
  }
  if (cursor) {
    const cursorSql = compileKeysetPredicate(req.sort, cursor, params, table);
    if (cursorSql) whereClauses.push(cursorSql);
  }
  const where = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : '';

  const orderBy = compileOrderBy(req.sort, table, req.direction);

  params.push(req.limit);
  const limit = ` LIMIT ?`;

  const sql = `SELECT ${projection} FROM ${quoteIdent(table.table)}${where}${orderBy}${limit}`;
  return { sql, params };
}

function compileGroupedQuery(
  req: BlockRequest,
  table: SqliteTableDescriptor,
): CompiledQuery {
  const groupCols = req.grouping!.columns.map((c) => {
    requireColumn(c, table);
    return quoteIdent(c);
  });
  const params: unknown[] = [];
  const whereClauses: string[] = [];
  if (req.filter) {
    whereClauses.push(compileFilter(req.filter, params, table));
  }
  const where = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : '';

  const aggregationProjections = (req.aggregations ?? [])
    .map((agg) => compileAggregation(agg, table))
    .join(', ');
  const projection =
    [
      ...groupCols,
      'COUNT(*) AS "__count__"',
      ...(aggregationProjections ? [aggregationProjections] : []),
    ].join(', ');

  const orderBy = ` ORDER BY ${groupCols.map((c) => `${c} ASC`).join(', ')}`;
  const sql = `SELECT ${projection} FROM ${quoteIdent(table.table)}${where} GROUP BY ${groupCols.join(', ')}${orderBy}`;
  return { sql, params };
}

function compileAggregation(
  agg: { columnId: string; fn: string; alias?: string },
  table: SqliteTableDescriptor,
): string {
  const alias = agg.alias ?? `${agg.fn}_${agg.columnId}`;
  if (agg.columnId !== '*') requireColumn(agg.columnId, table);
  const col = agg.columnId === '*' ? '*' : quoteIdent(agg.columnId);
  let fnExpr: string;
  switch (agg.fn) {
    case 'sum':
      // SQLite's SUM returns NULL on empty groups. COALESCE keeps
      // the result a number so consumers don't have to special-case.
      fnExpr = `COALESCE(SUM(${col}), 0)`;
      break;
    case 'avg':
      fnExpr = `AVG(${col})`;
      break;
    case 'count':
      fnExpr = `COUNT(${col})`;
      break;
    case 'countDistinct':
      fnExpr = `COUNT(DISTINCT ${col})`;
      break;
    case 'min':
      fnExpr = `MIN(${col})`;
      break;
    case 'max':
      fnExpr = `MAX(${col})`;
      break;
    default:
      throw new Error(`@onegrid/sqlite: unsupported aggregation fn "${agg.fn}".`);
  }
  return `${fnExpr} AS ${quoteIdent(alias)}`;
}

function compileFilter(
  node: FilterNode,
  params: unknown[],
  table: SqliteTableDescriptor,
): string {
  if (node.type === 'logical') {
    if (node.op === 'not') {
      const inner = node.filters[0];
      if (!inner) return 'TRUE';
      return `(NOT ${compileFilter(inner, params, table)})`;
    }
    if (node.filters.length === 0) return 'TRUE';
    const joiner = node.op === 'and' ? ' AND ' : ' OR ';
    return `(${node.filters
      .map((f) => compileFilter(f, params, table))
      .join(joiner)})`;
  }
  requireColumn(node.columnId, table);
  return compileComparison(node, params);
}

function compileComparison(
  node: { columnId: string; op: ComparisonOperator; value?: unknown; values?: ReadonlyArray<unknown>; caseSensitive?: boolean },
  params: unknown[],
): string {
  const col = quoteIdent(node.columnId);
  // SQLite LIKE is case-insensitive by default for ASCII. The
  // `case_sensitive_like = ON` PRAGMA flips it globally; per-query
  // we wrap with `LOWER()` to force case-insensitive comparison
  // when the consumer asks for it.
  const cs = node.caseSensitive !== false;
  const wrap = cs ? (s: string): string => s : (s: string): string => `LOWER(${s})`;
  switch (node.op) {
    case 'eq':
    case 'neq':
    case 'lt':
    case 'lte':
    case 'gt':
    case 'gte': {
      params.push(node.value);
      const op = { eq: '=', neq: '!=', lt: '<', lte: '<=', gt: '>', gte: '>=' }[node.op];
      return `${col} ${op} ?`;
    }
    case 'in':
    case 'notIn': {
      if (!node.values || node.values.length === 0) {
        return node.op === 'in' ? 'FALSE' : 'TRUE';
      }
      const placeholders = node.values.map((v) => {
        params.push(v);
        return '?';
      });
      return `${col} ${node.op === 'in' ? 'IN' : 'NOT IN'} (${placeholders.join(', ')})`;
    }
    case 'isNull':
      return `${col} IS NULL`;
    case 'isNotNull':
      return `${col} IS NOT NULL`;
    case 'contains':
    case 'notContains': {
      params.push(`%${escapeLike(String(node.value ?? ''))}%`);
      const not = node.op === 'notContains' ? 'NOT ' : '';
      return `${wrap(col)} ${not}LIKE ${wrap('?')} ESCAPE '\\'`;
    }
    case 'startsWith': {
      params.push(`${escapeLike(String(node.value ?? ''))}%`);
      return `${wrap(col)} LIKE ${wrap('?')} ESCAPE '\\'`;
    }
    case 'endsWith': {
      params.push(`%${escapeLike(String(node.value ?? ''))}`);
      return `${wrap(col)} LIKE ${wrap('?')} ESCAPE '\\'`;
    }
    case 'between':
    case 'notBetween': {
      const [lo, hi] = node.values ?? [];
      params.push(lo);
      params.push(hi);
      const not = node.op === 'notBetween' ? 'NOT ' : '';
      return `${col} ${not}BETWEEN ? AND ?`;
    }
  }
}

function compileOrderBy(
  sort: ReadonlyArray<SortField>,
  table: SqliteTableDescriptor,
  direction: BlockRequest['direction'],
): string {
  const fields = sort.map((field) => {
    requireColumn(field.columnId, table);
    const dir = field.direction === 'asc' ? 'ASC' : 'DESC';
    const nulls = (field.nulls ?? 'last').toUpperCase();
    return `${quoteIdent(field.columnId)} ${dir} NULLS ${nulls}`;
  });
  const allDesc = sort.length > 0 && sort.every((s) => s.direction === 'desc');
  const reqBefore = direction === 'before';
  const tieDir = allDesc !== reqBefore ? 'DESC' : 'ASC';
  fields.push(`${quoteIdent(table.primaryKey)} ${tieDir}`);
  return ` ORDER BY ${fields.join(', ')}`;
}

function compileKeysetPredicate(
  sort: ReadonlyArray<SortField>,
  cursor: KeysetCursor,
  params: unknown[],
  table: SqliteTableDescriptor,
): string {
  if (sort.length === 0) {
    params.push(cursor.rowId);
    return `${quoteIdent(table.primaryKey)} > ?`;
  }
  const lhs: string[] = [];
  const rhs: string[] = [];
  for (let i = 0; i < sort.length; i++) {
    const field = sort[i] as SortField;
    requireColumn(field.columnId, table);
    lhs.push(quoteIdent(field.columnId));
    params.push(cursor.sortValues[i] ?? null);
    rhs.push('?');
  }
  lhs.push(quoteIdent(table.primaryKey));
  params.push(cursor.rowId);
  rhs.push('?');
  const allDesc = sort.every((s) => s.direction === 'desc');
  const op = allDesc ? '<' : '>';
  return `(${lhs.join(', ')}) ${op} (${rhs.join(', ')})`;
}

function projectColumns(
  cols: ReadonlyArray<string> | undefined,
  table: SqliteTableDescriptor,
): string {
  if (!cols || cols.length === 0) {
    return table.columns.map((c) => quoteIdent(c)).join(', ');
  }
  return cols
    .map((c) => {
      requireColumn(c, table);
      return quoteIdent(c);
    })
    .join(', ');
}

function quoteIdent(id: string): string {
  if (id.includes('.')) {
    return id.split('.').map((part) => quoteIdent(part)).join('.');
  }
  return `"${id.replace(/"/g, '""')}"`;
}

function escapeLike(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function requireColumn(columnId: string, table: SqliteTableDescriptor): void {
  if (columnId === table.primaryKey) return;
  if (!table.columns.includes(columnId)) {
    throw new Error(
      `@onegrid/sqlite: unknown column "${columnId}" (not in table descriptor).`,
    );
  }
}

export function isLegacyOffsetCursor(cursor: string): boolean {
  return cursor.startsWith('offset:');
}

export function isKeysetCursor(cursor: string): boolean {
  return cursor.startsWith(KEYSET_PREFIX);
}

export function decodeKeysetCursor(cursor: string): KeysetCursor {
  const b64 = cursor.startsWith(KEYSET_PREFIX)
    ? cursor.slice(KEYSET_PREFIX.length)
    : cursor;
  const json =
    typeof globalThis.atob === 'function'
      ? globalThis.atob(b64)
      : Buffer.from(b64, 'base64').toString('utf-8');
  const parsed: unknown = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('decodeKeysetCursor: malformed payload.');
  }
  const obj = parsed as Record<string, unknown>;
  if (Array.isArray(obj.s) && 'r' in obj) {
    return { sortValues: obj.s, rowId: obj.r as string | number };
  }
  if (Array.isArray(obj.sortValues) && 'rowId' in obj) {
    return {
      sortValues: obj.sortValues,
      rowId: obj.rowId as string | number,
    };
  }
  throw new Error('decodeKeysetCursor: malformed payload.');
}

export function encodeKeysetCursor(cursor: KeysetCursor): string {
  const json = JSON.stringify({ s: cursor.sortValues, r: cursor.rowId });
  const b64 =
    typeof globalThis.btoa === 'function'
      ? globalThis.btoa(json)
      : Buffer.from(json, 'utf-8').toString('base64');
  return KEYSET_PREFIX + b64;
}
