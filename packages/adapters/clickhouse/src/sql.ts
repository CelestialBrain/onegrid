// =============================================================================
// ClickHouse SQL compiler — translates a BlockRequest into a query
// using ClickHouse's native named-parameter syntax (`{p0:Type}`).
//
// ClickHouse doesn't support traditional positional placeholders
// (`?`/`$N`); instead the HTTP / TCP protocol accepts URL params
// (`?param_p0=...`) referenced inline as `{p0:String}`. The
// `@clickhouse/client` library wraps this. This compiler emits
// the placeholder + a parallel `params: Record<string, unknown>`
// keyed by the same names, plus a `paramTypes: Record<string, string>`
// the consumer's client passes in the URL.
//
// Diverges from the other adapters at three places (all
// ClickHouse-idiomatic, not protocol leaks):
//   1. Placeholder shape: `{pN:Type}` named, not positional
//   2. Type hints: every placeholder needs a ClickHouse type
//      (String / Int64 / Float64 / Bool / Date). Inferred from the
//      JS value via a small heuristic.
//   3. NULLS FIRST/LAST: ClickHouse supports `NULLS FIRST`/`NULLS LAST`
//      since v22.x — emitted natively (same as Postgres).
// =============================================================================

import type {
  BlockRequest,
  ComparisonOperator,
  FilterNode,
  KeysetCursor,
  SortField,
} from '@onegrid/protocol';

export interface ChTableDescriptor {
  /** ClickHouse-qualified table identifier, e.g. `default.events`. */
  readonly table: string;
  /** Column ids that exist in the table. */
  readonly columns: ReadonlyArray<string>;
  /** Primary-key column id used as the keyset tiebreaker. */
  readonly primaryKey: string;
  /** Optional explicit column → ClickHouse type map. When provided,
   *  param type inference uses the descriptor instead of guessing
   *  from the JS value. v0.0.9 will make this required. */
  readonly columnTypes?: Readonly<Record<string, string>>;
}

export interface CompiledQuery {
  readonly sql: string;
  readonly params: Readonly<Record<string, unknown>>;
}

const KEYSET_PREFIX = 'ks:';

interface CompileCtx {
  readonly params: Record<string, unknown>;
  index: number;
  readonly table: ChTableDescriptor;
}

export function compileBlockQuery(
  req: BlockRequest,
  table: ChTableDescriptor,
  cursor: KeysetCursor | null,
): CompiledQuery {
  if (req.grouping && req.grouping.columns.length > 0) {
    return compileGroupedQuery(req, table);
  }
  return compileFlatQuery(req, table, cursor);
}

function compileFlatQuery(
  req: BlockRequest,
  table: ChTableDescriptor,
  cursor: KeysetCursor | null,
): CompiledQuery {
  const ctx: CompileCtx = { params: {}, index: 0, table };
  const projection = projectColumns(req.columns, table);

  const whereClauses: string[] = [];
  if (req.filter) whereClauses.push(compileFilter(req.filter, ctx));
  if (cursor) {
    const cursorSql = compileKeysetPredicate(req.sort, cursor, ctx);
    if (cursorSql) whereClauses.push(cursorSql);
  }
  const where = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : '';
  const orderBy = compileOrderBy(req.sort, table, req.direction);
  const limit = ` LIMIT ${addParam(ctx, req.limit, 'UInt64')}`;
  const sql = `SELECT ${projection} FROM ${quoteIdent(table.table)}${where}${orderBy}${limit}`;
  return { sql, params: ctx.params };
}

function compileGroupedQuery(
  req: BlockRequest,
  table: ChTableDescriptor,
): CompiledQuery {
  const ctx: CompileCtx = { params: {}, index: 0, table };
  const groupCols = req.grouping!.columns.map((c) => {
    requireColumn(c, table);
    return quoteIdent(c);
  });
  const whereClauses: string[] = [];
  if (req.filter) whereClauses.push(compileFilter(req.filter, ctx));
  const where = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : '';

  const aggregationProjections = (req.aggregations ?? [])
    .map((agg) => compileAggregation(agg, table))
    .join(', ');
  const projection =
    [
      ...groupCols,
      'toUInt64(count()) AS `__count__`',
      ...(aggregationProjections ? [aggregationProjections] : []),
    ].join(', ');

  const orderBy = ` ORDER BY ${groupCols.map((c) => `${c} ASC`).join(', ')}`;
  const sql = `SELECT ${projection} FROM ${quoteIdent(table.table)}${where} GROUP BY ${groupCols.join(', ')}${orderBy}`;
  return { sql, params: ctx.params };
}

function compileAggregation(
  agg: { columnId: string; fn: string; alias?: string },
  table: ChTableDescriptor,
): string {
  const alias = agg.alias ?? `${agg.fn}_${agg.columnId}`;
  if (agg.columnId !== '*') requireColumn(agg.columnId, table);
  const col = agg.columnId === '*' ? '*' : quoteIdent(agg.columnId);
  let fnExpr: string;
  switch (agg.fn) {
    case 'sum':
      // ClickHouse's sum returns 0 on empty input (different from
      // Postgres/SQLite) — no COALESCE needed.
      fnExpr = `toFloat64(sum(${col}))`;
      break;
    case 'avg':
      fnExpr = `toFloat64(avg(${col}))`;
      break;
    case 'count':
      fnExpr = `toUInt64(count(${col}))`;
      break;
    case 'countDistinct':
      fnExpr = `toUInt64(uniqExact(${col}))`;
      break;
    case 'min':
      fnExpr = `min(${col})`;
      break;
    case 'max':
      fnExpr = `max(${col})`;
      break;
    default:
      throw new Error(`@onegrid/clickhouse: unsupported aggregation fn "${agg.fn}".`);
  }
  return `${fnExpr} AS ${quoteIdent(alias)}`;
}

function compileFilter(node: FilterNode, ctx: CompileCtx): string {
  if (node.type === 'logical') {
    if (node.op === 'not') {
      const inner = node.filters[0];
      if (!inner) return 'true';
      return `(NOT ${compileFilter(inner, ctx)})`;
    }
    if (node.filters.length === 0) return 'true';
    const joiner = node.op === 'and' ? ' AND ' : ' OR ';
    return `(${node.filters.map((f) => compileFilter(f, ctx)).join(joiner)})`;
  }
  requireColumn(node.columnId, ctx.table);
  return compileComparison(node, ctx);
}

function compileComparison(
  node: { columnId: string; op: ComparisonOperator; value?: unknown; values?: ReadonlyArray<unknown>; caseSensitive?: boolean },
  ctx: CompileCtx,
): string {
  const col = quoteIdent(node.columnId);
  const cs = node.caseSensitive !== false;
  // ClickHouse string LIKE is case-sensitive by default; ILIKE for
  // case-insensitive. Wrap accordingly.
  const colType = inferColumnType(node.columnId, ctx.table);
  switch (node.op) {
    case 'eq':
    case 'neq':
    case 'lt':
    case 'lte':
    case 'gt':
    case 'gte': {
      const ph = addParam(ctx, node.value, colType);
      const op = { eq: '=', neq: '!=', lt: '<', lte: '<=', gt: '>', gte: '>=' }[node.op];
      return `${col} ${op} ${ph}`;
    }
    case 'in':
    case 'notIn': {
      if (!node.values || node.values.length === 0) {
        return node.op === 'in' ? 'false' : 'true';
      }
      const placeholders = node.values.map((v) => addParam(ctx, v, colType));
      return `${col} ${node.op === 'in' ? 'IN' : 'NOT IN'} (${placeholders.join(', ')})`;
    }
    case 'isNull':
      return `${col} IS NULL`;
    case 'isNotNull':
      return `${col} IS NOT NULL`;
    case 'contains':
    case 'notContains': {
      const ph = addParam(ctx, `%${escapeLike(String(node.value ?? ''))}%`, 'String');
      const not = node.op === 'notContains' ? 'NOT ' : '';
      const op = cs ? 'LIKE' : 'ILIKE';
      return `${col} ${not}${op} ${ph}`;
    }
    case 'startsWith': {
      const ph = addParam(ctx, `${escapeLike(String(node.value ?? ''))}%`, 'String');
      return `${col} ${cs ? 'LIKE' : 'ILIKE'} ${ph}`;
    }
    case 'endsWith': {
      const ph = addParam(ctx, `%${escapeLike(String(node.value ?? ''))}`, 'String');
      return `${col} ${cs ? 'LIKE' : 'ILIKE'} ${ph}`;
    }
    case 'between':
    case 'notBetween': {
      const [lo, hi] = node.values ?? [];
      const phLo = addParam(ctx, lo, colType);
      const phHi = addParam(ctx, hi, colType);
      const not = node.op === 'notBetween' ? 'NOT ' : '';
      return `${col} ${not}BETWEEN ${phLo} AND ${phHi}`;
    }
  }
}

function compileOrderBy(
  sort: ReadonlyArray<SortField>,
  table: ChTableDescriptor,
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
  ctx: CompileCtx,
): string {
  if (sort.length === 0) {
    const ph = addParam(
      ctx,
      cursor.rowId,
      inferColumnType(ctx.table.primaryKey, ctx.table),
    );
    return `${quoteIdent(ctx.table.primaryKey)} > ${ph}`;
  }
  const lhs: string[] = [];
  const rhs: string[] = [];
  for (let i = 0; i < sort.length; i++) {
    const field = sort[i] as SortField;
    requireColumn(field.columnId, ctx.table);
    lhs.push(quoteIdent(field.columnId));
    rhs.push(
      addParam(
        ctx,
        cursor.sortValues[i] ?? null,
        inferColumnType(field.columnId, ctx.table),
      ),
    );
  }
  lhs.push(quoteIdent(ctx.table.primaryKey));
  rhs.push(
    addParam(
      ctx,
      cursor.rowId,
      inferColumnType(ctx.table.primaryKey, ctx.table),
    ),
  );
  const allDesc = sort.every((s) => s.direction === 'desc');
  const op = allDesc ? '<' : '>';
  return `(${lhs.join(', ')}) ${op} (${rhs.join(', ')})`;
}

function projectColumns(
  cols: ReadonlyArray<string> | undefined,
  table: ChTableDescriptor,
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
  // ClickHouse identifier quoting: backticks. Embedded backticks
  // doubled.
  return `\`${id.replace(/`/g, '``')}\``;
}

function escapeLike(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function requireColumn(columnId: string, table: ChTableDescriptor): void {
  if (columnId === table.primaryKey) return;
  if (!table.columns.includes(columnId)) {
    throw new Error(
      `@onegrid/clickhouse: unknown column "${columnId}" (not in table descriptor).`,
    );
  }
}

function addParam(ctx: CompileCtx, value: unknown, type: string): string {
  const key = `p${String(ctx.index++)}`;
  ctx.params[key] = value;
  return `{${key}:${type}}`;
}

/**
 * Pick a ClickHouse type for the placeholder. Prefers the explicit
 * `columnTypes` map if the descriptor provides one; otherwise
 * falls back to a String-typed placeholder (the most permissive
 * since ClickHouse coerces String literals to most other types).
 */
function inferColumnType(
  columnId: string,
  table: ChTableDescriptor,
): string {
  return table.columnTypes?.[columnId] ?? 'String';
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
