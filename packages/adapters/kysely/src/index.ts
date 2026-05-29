// =============================================================================
// @onegrid/kysely
//
// Kysely query-builder adapter. Translates oneGrid's BlockRequest into a
// type-safe SQL query through Kysely's expression builder. Works against any
// Kysely dialect: Postgres, MySQL, SQLite, MSSQL, Cloudflare D1, etc.
//
// Unlike the Drizzle adapter (which can introspect column metadata from the
// drizzle table object), Kysely is a pure query-builder with no schema
// reflection at runtime — the user provides the schema explicitly.
// =============================================================================

import type {
  BlockRequest,
  BlockResponse,
  ComparisonFilter,
  DataSource,
  FetchOptions,
  FilterModel,
  FilterNode,
  LogicalFilter,
  Schema,
  SortField,
  SortModel,
} from '@onegrid/protocol';

import { decodeCursor, encodeCursor, type KeysetCursor } from './cursor';

// --- Minimal structural types so we don't take a hard dep on `kysely` ---
//
// Kysely's full types are extremely generic (Database<DB, TB, ...>) and we
// don't need any of that machinery to drive its expression builder. The
// adapter only relies on these structural shapes; pass any kysely instance
// at the call site and TS narrows it via the structural match.

/** @public */
export interface KyselyExpressionBuilder {
  (column: string, op: KyselyComparisonOp, value: unknown): KyselyExpression;
  and: (exprs: ReadonlyArray<KyselyExpression>) => KyselyExpression;
  or: (exprs: ReadonlyArray<KyselyExpression>) => KyselyExpression;
  not: (expr: KyselyExpression) => KyselyExpression;
}

/** @public */
export type KyselyComparisonOp =
  | '='
  | '!='
  | '<'
  | '<='
  | '>'
  | '>='
  | 'in'
  | 'not in'
  | 'is'
  | 'is not'
  | 'like'
  | 'ilike'
  | 'not like';

/** @public */
export interface KyselyExpression {
  // opaque marker; kysely's `Expression<unknown>` carries internal shape we
  // don't need to inspect.
  readonly __kyselyExpression?: never;
}

/** @public */
export interface KyselySelectQueryBuilder {
  selectAll: () => KyselySelectQueryBuilder;
  where: (
    factory: (eb: KyselyExpressionBuilder) => KyselyExpression,
  ) => KyselySelectQueryBuilder;
  orderBy: (column: string, direction: 'asc' | 'desc') => KyselySelectQueryBuilder;
  limit: (n: number) => KyselySelectQueryBuilder;
  execute: () => Promise<ReadonlyArray<Record<string, unknown>>>;
}

/** @public */
export interface KyselyClient {
  selectFrom: (table: string) => KyselySelectQueryBuilder;
}

// -----------------------------------------------------------------------------

/** @public */
export interface KyselyDataSourceOptions {
  /** Kysely instance. Any `Kysely<DB>` works structurally. */
  readonly db: KyselyClient;
  /** Table to query against. */
  readonly tableName: string;
  /** Primary-key column for cursor tiebreaking. */
  readonly idColumn: string;
  /**
   * Schema for the table. Required: Kysely doesn't ship runtime introspection,
   * so the adapter can't derive this. Generate from your migrations or
   * Kysely's `IntrospectorDialect` at app init.
   */
  readonly schema: Schema;
  /** Default page size if a request omits `limit`. Default 200. */
  readonly defaultLimit?: number;
}

/** @public */
export function createKyselyDataSource(options: KyselyDataSourceOptions): DataSource {
  const defaultLimit = options.defaultLimit ?? 200;

  async function fetchBlock(
    req: BlockRequest,
    opts?: FetchOptions,
  ): Promise<BlockResponse<'json'>> {
    if (opts?.signal?.aborted) {
      throw new DOMException('aborted', 'AbortError');
    }

    const limit = req.limit > 0 ? req.limit : defaultLimit;
    const direction = req.direction;
    const sort = req.sort;

    let qb = options.db.selectFrom(options.tableName).selectAll();

    // Only attach a WHERE clause when we actually have something to constrain.
    // The previous "always-true" fallback (`eb('1', '=', 1)`) round-tripped
    // through kysely as the literal column `"1"`, which Postgres rejects
    // with "column \"1\" does not exist".
    if (req.filter !== null || req.cursor != null) {
      qb = qb.where((eb) => {
        const conditions: KyselyExpression[] = [];
        const filterCondition = translateFilter(req.filter, eb);
        if (filterCondition) conditions.push(filterCondition);
        if (req.cursor) {
          const cur = decodeCursor(req.cursor);
          const cursorCondition = translateCursor(sort, options.idColumn, cur, direction, eb);
          if (cursorCondition) conditions.push(cursorCondition);
        }
        if (conditions.length === 0) {
          // Filter/cursor translated to nothing — provide a tautology that
          // kysely will render as a SQL literal rather than a column ref.
          return eb.and([]);
        }
        return conditions.length === 1 ? conditions[0]! : eb.and(conditions);
      });
    }

    for (const order of buildOrderBy(sort, options.idColumn, direction)) {
      qb = qb.orderBy(order.column, order.direction);
    }
    qb = qb.limit(limit + 1);

    const rowsRaw = await qb.execute();
    if (opts?.signal?.aborted) {
      throw new DOMException('aborted', 'AbortError');
    }

    const hasMore = rowsRaw.length > limit;
    let rows = hasMore ? rowsRaw.slice(0, limit) : rowsRaw.slice();
    if (direction === 'before') rows = rows.slice().reverse();

    const nextCursor = hasMore ? buildCursor(rows[rows.length - 1]!, sort, options.idColumn) : null;
    const prevCursor = rows.length > 0 ? buildCursor(rows[0]!, sort, options.idColumn) : null;

    return {
      encoding: 'json',
      rows,
      nextCursor: direction === 'after' ? nextCursor : prevCursor,
      prevCursor: direction === 'after' ? prevCursor : nextCursor,
    };
  }

  return {
    schema: () => options.schema,
    fetchBlock,
  };
}

// -----------------------------------------------------------------------------
// Filter translation
// -----------------------------------------------------------------------------

function translateFilter(
  filter: FilterModel,
  eb: KyselyExpressionBuilder,
): KyselyExpression | undefined {
  if (!filter) return undefined;
  return translateNode(filter, eb);
}

function translateNode(
  node: FilterNode,
  eb: KyselyExpressionBuilder,
): KyselyExpression | undefined {
  if (node.type === 'comparison') return translateComparison(node, eb);
  return translateLogical(node, eb);
}

function translateComparison(
  node: ComparisonFilter,
  eb: KyselyExpressionBuilder,
): KyselyExpression | undefined {
  switch (node.op) {
    case 'eq':
      return eb(node.columnId, '=', node.value);
    case 'neq':
      return eb(node.columnId, '!=', node.value);
    case 'lt':
      return eb(node.columnId, '<', node.value);
    case 'lte':
      return eb(node.columnId, '<=', node.value);
    case 'gt':
      return eb(node.columnId, '>', node.value);
    case 'gte':
      return eb(node.columnId, '>=', node.value);
    case 'in':
      return eb(node.columnId, 'in', [...(node.values ?? [])]);
    case 'notIn':
      return eb(node.columnId, 'not in', [...(node.values ?? [])]);
    case 'isNull':
      return eb(node.columnId, 'is', null);
    case 'isNotNull':
      return eb(node.columnId, 'is not', null);
    case 'between': {
      const [lo, hi] = node.values ?? [];
      return eb.and([eb(node.columnId, '>=', lo), eb(node.columnId, '<=', hi)]);
    }
    case 'notBetween': {
      const [lo, hi] = node.values ?? [];
      return eb.or([eb(node.columnId, '<', lo), eb(node.columnId, '>', hi)]);
    }
    case 'contains': {
      const op = node.caseSensitive ? 'like' : 'ilike';
      return eb(node.columnId, op, `%${escapeLike(String(node.value ?? ''))}%`);
    }
    case 'notContains': {
      // `not like` keeps the same case-sensitivity rule. ilike's negation is
      // not part of SQL standard; rely on `not like` with an UPPER cast in
      // dialects that need case-insensitive negation.
      const op = node.caseSensitive ? 'not like' : 'not like';
      return eb(node.columnId, op, `%${escapeLike(String(node.value ?? ''))}%`);
    }
    case 'startsWith': {
      const op = node.caseSensitive ? 'like' : 'ilike';
      return eb(node.columnId, op, `${escapeLike(String(node.value ?? ''))}%`);
    }
    case 'endsWith': {
      const op = node.caseSensitive ? 'like' : 'ilike';
      return eb(node.columnId, op, `%${escapeLike(String(node.value ?? ''))}`);
    }
    default:
      return undefined;
  }
}

function translateLogical(
  node: LogicalFilter,
  eb: KyselyExpressionBuilder,
): KyselyExpression | undefined {
  if (node.op === 'not') {
    const inner = node.filters[0];
    if (!inner) return undefined;
    const sub = translateNode(inner, eb);
    return sub ? eb.not(sub) : undefined;
  }
  const subs = node.filters
    .map((f) => translateNode(f, eb))
    .filter((s): s is KyselyExpression => Boolean(s));
  if (subs.length === 0) return undefined;
  if (subs.length === 1) return subs[0];
  return node.op === 'and' ? eb.and(subs) : eb.or(subs);
}

// -----------------------------------------------------------------------------
// Cursor / order-by
// -----------------------------------------------------------------------------

function translateCursor(
  sort: SortModel,
  idColumn: string,
  cursor: KeysetCursor,
  direction: 'after' | 'before',
  eb: KyselyExpressionBuilder,
): KyselyExpression | undefined {
  const fields: Array<{ column: string; direction: 'asc' | 'desc'; value: unknown }> = sort.map(
    (s, i) => ({
      column: s.columnId,
      direction: s.direction,
      value: cursor.sortValues[i],
    }),
  );
  fields.push({ column: idColumn, direction: 'asc', value: cursor.rowId });

  const branches: KyselyExpression[] = [];
  for (let i = 0; i < fields.length; i++) {
    const branch: KyselyExpression[] = [];
    for (let j = 0; j < i; j++) {
      branch.push(eb(fields[j]!.column, '=', fields[j]!.value));
    }
    const last = fields[i]!;
    const goingForward = direction === 'after';
    const op: KyselyComparisonOp = (last.direction === 'asc') === goingForward ? '>' : '<';
    branch.push(eb(last.column, op, last.value));
    branches.push(branch.length === 1 ? branch[0]! : eb.and(branch));
  }
  if (branches.length === 0) return undefined;
  if (branches.length === 1) return branches[0];
  return eb.or(branches);
}

function buildOrderBy(
  sort: SortModel,
  idColumn: string,
  direction: 'after' | 'before',
): Array<{ column: string; direction: 'asc' | 'desc' }> {
  const out: Array<{ column: string; direction: 'asc' | 'desc' }> = [];
  for (const s of sort) {
    const goingForward = direction === 'after';
    const ascDirection = (s.direction === 'asc') === goingForward;
    out.push({ column: s.columnId, direction: ascDirection ? 'asc' : 'desc' });
  }
  out.push({ column: idColumn, direction: direction === 'after' ? 'asc' : 'desc' });
  return out;
}

function buildCursor(
  row: Record<string, unknown>,
  sort: SortModel,
  idColumnName: string,
): string {
  const sortValues = sort.map((s) => row[s.columnId]);
  const rowId = (row[idColumnName] ?? null) as string | number;
  return encodeCursor({ sortValues, rowId });
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export type { KeysetCursor } from './cursor';
export { encodeCursor, decodeCursor } from './cursor';
