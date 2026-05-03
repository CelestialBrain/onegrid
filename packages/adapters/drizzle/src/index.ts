// =============================================================================
// @onegrid/drizzle
//
// Drizzle ORM adapter. Translates oneGrid's BlockRequest into Drizzle queries
// with keyset (cursor) pagination. Works against any Drizzle-supported
// dialect: Postgres, MySQL, SQLite, Cloudflare D1, Bun SQLite, etc.
//
// What's wired up in v0.0.3:
//   - schema()       — derives ColumnSchema[] from drizzle's column metadata
//                      where possible; user can override via `schema` option.
//   - fetchBlock()   — translates SortModel → orderBy, FilterModel → where,
//                      cursor → keyset condition (after / before),
//                      and limit. Returns JSON-encoded rows.
//
// Not yet wired (will land in subsequent versions):
//   - subscribe / live updates
//   - mutate (write-back) — reasonable since most apps want explicit
//     mutation paths anyway.
//   - GROUP BY / pivot — depends on @onegrid/data's group tree being
//     pushed server-side first.
//
// =============================================================================

import type {
  BlockRequest,
  BlockResponse,
  ColumnSchema,
  ColumnType,
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
import {
  and as drAnd,
  asc as drAsc,
  desc as drDesc,
  eq as drEq,
  getTableColumns,
  gt as drGt,
  gte as drGte,
  ilike as drIlike,
  inArray as drInArray,
  isNull as drIsNull,
  isNotNull as drIsNotNull,
  like as drLike,
  lt as drLt,
  lte as drLte,
  ne as drNe,
  not as drNot,
  notInArray as drNotInArray,
  or as drOr,
  type Column,
  type SQL,
  type Table,
} from 'drizzle-orm';

import { encodeCursor, decodeCursor, type KeysetCursor } from './cursor';

export interface DrizzleDataSourceOptions<TTable extends Table = Table> {
  /**
   * The Drizzle database client (e.g. `drizzle(pgClient)`). The adapter
   * doesn't introspect the client beyond calling its `select()` chain;
   * any dialect drizzle supports works.
   */
  readonly db: DrizzleClient;
  /** Drizzle table reference (the value, not the type). */
  readonly table: TTable;
  /** Column id used as the keyset tiebreaker in cursor pagination. */
  readonly idColumn: string;
  /**
   * Override the auto-derived schema. Useful when drizzle's column metadata
   * doesn't carry the precision/timezone you want oneGrid to expose, or
   * when the table has computed columns.
   */
  readonly schema?: Schema;
  /** Default page size if a request omits `limit`. Default 200. */
  readonly defaultLimit?: number;
}

export interface DrizzleClient {
  select: (fields?: Record<string, unknown>) => DrizzleSelect;
}

export interface DrizzleSelect {
  from: (table: Table) => DrizzleQueryBuilder;
}

export interface DrizzleQueryBuilder {
  where: (condition: SQL) => DrizzleQueryBuilder;
  orderBy: (...fields: SQL[]) => DrizzleQueryBuilder;
  limit: (n: number) => DrizzleQueryBuilder;
  /** Drizzle query builders are thenable. */
  then: <T>(
    onfulfilled: (rows: ReadonlyArray<Record<string, unknown>>) => T | PromiseLike<T>,
    onrejected?: (reason: unknown) => unknown,
  ) => Promise<T>;
}

export function createDrizzleDataSource<TTable extends Table>(
  options: DrizzleDataSourceOptions<TTable>,
): DataSource {
  const defaultLimit = options.defaultLimit ?? 200;
  const tableColumns = getTableColumns(options.table) as Record<string, Column>;

  function getColumn(columnId: string): Column {
    const col = tableColumns[columnId];
    if (!col) {
      throw new Error(`@onegrid/drizzle: unknown column "${columnId}" on the table.`);
    }
    return col;
  }

  function deriveSchema(): Schema {
    if (options.schema) return options.schema;
    const out: ColumnSchema[] = [];
    for (const [id, column] of Object.entries(tableColumns)) {
      out.push({
        id,
        type: drizzleColumnTypeToOneGrid((column as { dataType?: string }).dataType ?? 'unknown'),
        nullable: (column as { notNull?: boolean }).notNull !== true,
      });
    }
    return out;
  }

  const schemaCache = deriveSchema();

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
    const idColumn = getColumn(options.idColumn);

    const conditions: SQL[] = [];
    const filterCondition = translateFilter(req.filter, getColumn);
    if (filterCondition) conditions.push(filterCondition);
    if (req.cursor) {
      const cur = decodeCursor(req.cursor);
      const cursorCondition = translateCursor(sort, getColumn, idColumn, cur, direction);
      if (cursorCondition) conditions.push(cursorCondition);
    }
    const where = combineAnd(conditions);

    const orderBy = buildOrderBy(sort, getColumn, idColumn, direction);

    let qb: DrizzleQueryBuilder = options.db.select().from(options.table);
    if (where) qb = qb.where(where);
    qb = qb.orderBy(...orderBy).limit(limit + 1); // +1 to detect more

    const rowsRaw = await qb.then((r) => r);
    if (opts?.signal?.aborted) {
      throw new DOMException('aborted', 'AbortError');
    }

    // We over-fetched by 1 to know whether there's a next block.
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
    schema: () => schemaCache,
    fetchBlock,
  };
}

// -----------------------------------------------------------------------------
// Filter translation
// -----------------------------------------------------------------------------

function translateFilter(
  filter: FilterModel,
  getColumn: (id: string) => Column,
): SQL | undefined {
  if (!filter) return undefined;
  return translateNode(filter, getColumn);
}

function translateNode(
  node: FilterNode,
  getColumn: (id: string) => Column,
): SQL | undefined {
  if (node.type === 'comparison') return translateComparison(node, getColumn);
  return translateLogical(node, getColumn);
}

function translateComparison(
  node: ComparisonFilter,
  getColumn: (id: string) => Column,
): SQL | undefined {
  const col = getColumn(node.columnId);
  switch (node.op) {
    case 'eq':
      return drEq(col, node.value);
    case 'neq':
      return drNe(col, node.value);
    case 'lt':
      return drLt(col, node.value);
    case 'lte':
      return drLte(col, node.value);
    case 'gt':
      return drGt(col, node.value);
    case 'gte':
      return drGte(col, node.value);
    case 'in':
      return drInArray(col, [...(node.values ?? [])]);
    case 'notIn':
      return drNotInArray(col, [...(node.values ?? [])]);
    case 'isNull':
      return drIsNull(col);
    case 'isNotNull':
      return drIsNotNull(col);
    case 'between': {
      const [lo, hi] = node.values ?? [];
      return drAnd(drGte(col, lo), drLte(col, hi));
    }
    case 'notBetween': {
      const [lo, hi] = node.values ?? [];
      return drOr(drLt(col, lo), drGt(col, hi));
    }
    case 'contains': {
      const op = node.caseSensitive ? drLike : drIlike;
      return op(col, `%${escapeLike(String(node.value ?? ''))}%`);
    }
    case 'notContains': {
      const op = node.caseSensitive ? drLike : drIlike;
      return drNot(op(col, `%${escapeLike(String(node.value ?? ''))}%`));
    }
    case 'startsWith': {
      const op = node.caseSensitive ? drLike : drIlike;
      return op(col, `${escapeLike(String(node.value ?? ''))}%`);
    }
    case 'endsWith': {
      const op = node.caseSensitive ? drLike : drIlike;
      return op(col, `%${escapeLike(String(node.value ?? ''))}`);
    }
    default:
      return undefined;
  }
}

function translateLogical(
  node: LogicalFilter,
  getColumn: (id: string) => Column,
): SQL | undefined {
  if (node.op === 'not') {
    const inner = node.filters[0];
    if (!inner) return undefined;
    const sub = translateNode(inner, getColumn);
    return sub ? drNot(sub) : undefined;
  }
  const subs = node.filters
    .map((f) => translateNode(f, getColumn))
    .filter((s): s is SQL => Boolean(s));
  if (subs.length === 0) return undefined;
  if (subs.length === 1) return subs[0];
  return node.op === 'and' ? drAnd(...subs) : drOr(...subs);
}

function combineAnd(conditions: ReadonlyArray<SQL>): SQL | undefined {
  if (conditions.length === 0) return undefined;
  if (conditions.length === 1) return conditions[0];
  return drAnd(...conditions);
}

// -----------------------------------------------------------------------------
// Cursor pagination
// -----------------------------------------------------------------------------

/**
 * Build the keyset condition expressing "row > cursor" (or "row < cursor"
 * for backward pagination) under the given sort. Multi-column sort uses a
 * disjunction of equality-prefixed inequalities — the textbook
 * tuple comparison.
 */
function translateCursor(
  sort: SortModel,
  getColumn: (id: string) => Column,
  idColumn: Column,
  cursor: KeysetCursor,
  direction: 'after' | 'before',
): SQL | undefined {
  const fields: Array<{ column: Column; direction: 'asc' | 'desc'; value: unknown }> = sort.map(
    (s, i) => ({
      column: getColumn(s.columnId),
      direction: s.direction,
      value: cursor.sortValues[i],
    }),
  );
  fields.push({ column: idColumn, direction: 'asc', value: cursor.rowId });

  // Build OR of (eq prefix..., gt/lt last) for each i.
  const branches: SQL[] = [];
  for (let i = 0; i < fields.length; i++) {
    const branch: SQL[] = [];
    for (let j = 0; j < i; j++) {
      branch.push(drEq(fields[j]!.column, fields[j]!.value));
    }
    const last = fields[i]!;
    const goingForward = direction === 'after';
    const op = (last.direction === 'asc') === goingForward ? drGt : drLt;
    branch.push(op(last.column, last.value));
    branches.push(branch.length === 1 ? branch[0]! : drAnd(...branch)!);
  }
  if (branches.length === 0) return undefined;
  if (branches.length === 1) return branches[0];
  return drOr(...branches);
}

function buildOrderBy(
  sort: SortModel,
  getColumn: (id: string) => Column,
  idColumn: Column,
  direction: 'after' | 'before',
): SQL[] {
  const out: SQL[] = [];
  for (const s of sort) {
    const col = getColumn(s.columnId);
    const goingForward = direction === 'after';
    const ascDirection = (s.direction === 'asc') === goingForward;
    out.push((ascDirection ? drAsc : drDesc)(col));
  }
  // tiebreaker
  out.push(direction === 'after' ? drAsc(idColumn) : drDesc(idColumn));
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

// -----------------------------------------------------------------------------
// Drizzle column type → oneGrid ColumnType
// -----------------------------------------------------------------------------

const TYPE_MAP: Record<string, ColumnType> = {
  number: 'float64',
  integer: 'int32',
  bigint: 'int64',
  boolean: 'bool',
  string: 'utf8',
  date: 'timestamp',
  json: 'json',
  buffer: 'binary',
};

function drizzleColumnTypeToOneGrid(dataType: string): ColumnType {
  return TYPE_MAP[dataType] ?? 'unknown';
}

export type { KeysetCursor } from './cursor';
export { encodeCursor, decodeCursor } from './cursor';
