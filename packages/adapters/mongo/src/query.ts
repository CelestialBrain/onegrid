// =============================================================================
// MongoDB query compiler — translates a BlockRequest into the
// shapes the Mongo Node driver consumes:
//
//   - find(filter, options)   for flat queries (BlockRequest without
//                              `grouping`)
//   - aggregate(pipeline)     for grouped queries (BlockRequest with
//                              `grouping`)
//
// Identifier safety: every field id is checked against the
// collection descriptor's `fields` whitelist so unknown / user-
// supplied names can't reach the wire. Mongo doesn't have SQL
// injection per se, but accepting arbitrary field names from a
// request body is still a privilege escalation risk.
// =============================================================================

import type {
  AggregationModel,
  BlockRequest,
  ComparisonOperator,
  FilterNode,
  KeysetCursor,
  SortField,
} from '@onegrid/protocol';

export interface MongoCollectionDescriptor {
  /** Collection name (no database prefix; the consumer's client
   *  already binds to a specific database). */
  readonly collection: string;
  /** Field ids that exist in the document shape. */
  readonly fields: ReadonlyArray<string>;
  /** Primary-key field used as the keyset tiebreaker. Typically
   *  `_id` for native ObjectIds; can be a stable application key
   *  when the collection has one. */
  readonly primaryKey: string;
}

export interface CompiledFlatQuery {
  readonly kind: 'find';
  readonly filter: Record<string, unknown>;
  readonly sort: Record<string, 1 | -1>;
  readonly projection: Record<string, 1>;
  readonly limit: number;
}

export interface CompiledAggregateQuery {
  readonly kind: 'aggregate';
  readonly pipeline: ReadonlyArray<Record<string, unknown>>;
}

export type CompiledQuery = CompiledFlatQuery | CompiledAggregateQuery;

export function compileBlockQuery(
  req: BlockRequest,
  collection: MongoCollectionDescriptor,
  cursor: KeysetCursor | null,
): CompiledQuery {
  if (req.grouping && req.grouping.columns.length > 0) {
    return compileAggregate(req, collection);
  }
  return compileFind(req, collection, cursor);
}

function compileFind(
  req: BlockRequest,
  collection: MongoCollectionDescriptor,
  cursor: KeysetCursor | null,
): CompiledFlatQuery {
  const baseFilter = req.filter
    ? compileFilter(req.filter, collection)
    : {};
  const cursorFilter = cursor ? compileKeysetFilter(req.sort, cursor, collection) : null;
  const filter = cursorFilter
    ? Object.keys(baseFilter).length > 0
      ? { $and: [baseFilter, cursorFilter] }
      : cursorFilter
    : baseFilter;

  const sort = compileSort(req.sort, collection, req.direction);
  const projection = compileProjection(req.columns, collection);

  return {
    kind: 'find',
    filter,
    sort,
    projection,
    limit: req.limit,
  };
}

function compileAggregate(
  req: BlockRequest,
  collection: MongoCollectionDescriptor,
): CompiledAggregateQuery {
  const stages: Record<string, unknown>[] = [];
  if (req.filter) {
    stages.push({ $match: compileFilter(req.filter, collection) });
  }

  const groupCols = req.grouping!.columns;
  for (const c of groupCols) requireField(c, collection);

  // Build the $group _id field. With multiple group columns, the
  // _id becomes an object so each combination yields one bucket.
  const groupId =
    groupCols.length === 1
      ? `$${groupCols[0]!}`
      : groupCols.reduce<Record<string, string>>((acc, col) => {
          acc[col] = `$${col}`;
          return acc;
        }, {});

  const groupStage: Record<string, unknown> = {
    _id: groupId,
    __count__: { $sum: 1 },
  };
  for (const agg of req.aggregations ?? []) {
    const alias = agg.alias ?? `${agg.fn}_${agg.columnId}`;
    groupStage[alias] = compileAggregation(agg, collection);
  }
  stages.push({ $group: groupStage });

  // Project _id back into the named group columns so the response
  // rows look like `{ status: 'active', __count__: 200000, ... }`
  // instead of `{ _id: 'active', __count__: 200000 }`.
  const projectStage: Record<string, unknown> = { _id: 0, __count__: 1 };
  if (groupCols.length === 1) {
    const single = groupCols[0]!;
    projectStage[single] = '$_id';
  } else {
    for (const c of groupCols) projectStage[c] = `$_id.${c}`;
  }
  for (const agg of req.aggregations ?? []) {
    projectStage[agg.alias ?? `${agg.fn}_${agg.columnId}`] = 1;
  }
  stages.push({ $project: projectStage });

  // Stable sort order for the response.
  const sortStage: Record<string, 1 | -1> = {};
  for (const c of groupCols) sortStage[c] = 1;
  stages.push({ $sort: sortStage });

  return { kind: 'aggregate', pipeline: stages };
}

function compileAggregation(
  agg: { columnId: string; fn: string; alias?: string },
  collection: MongoCollectionDescriptor,
): Record<string, unknown> {
  if (agg.columnId !== '*') requireField(agg.columnId, collection);
  const fieldRef = agg.columnId === '*' ? null : `$${agg.columnId}`;
  switch (agg.fn) {
    case 'sum':
      return { $sum: fieldRef ?? 1 };
    case 'avg':
      return { $avg: fieldRef };
    case 'count':
      return fieldRef === null
        ? { $sum: 1 }
        : { $sum: { $cond: [{ $ne: [fieldRef, null] }, 1, 0] } };
    case 'countDistinct':
      // $addToSet + $size achieves count-distinct in a $group stage.
      // The accumulator $addToSet is unbounded; for huge cardinalities
      // consumers should switch to a separate distinct() pre-stage.
      return { $addToSet: fieldRef };
    case 'min':
      return { $min: fieldRef };
    case 'max':
      return { $max: fieldRef };
    default:
      throw new Error(`@onegrid/mongo: unsupported aggregation fn "${agg.fn}".`);
  }
}

function compileFilter(
  node: FilterNode,
  collection: MongoCollectionDescriptor,
): Record<string, unknown> {
  if (node.type === 'logical') {
    if (node.op === 'not') {
      const inner = node.filters[0];
      if (!inner) return {};
      return { $nor: [compileFilter(inner, collection)] };
    }
    if (node.filters.length === 0) return {};
    const operator = node.op === 'and' ? '$and' : '$or';
    return {
      [operator]: node.filters.map((f) => compileFilter(f, collection)),
    };
  }
  requireField(node.columnId, collection);
  return { [node.columnId]: compileComparison(node) };
}

function compileComparison(node: {
  op: ComparisonOperator;
  value?: unknown;
  values?: ReadonlyArray<unknown>;
  caseSensitive?: boolean;
}): unknown {
  const cs = node.caseSensitive !== false;
  switch (node.op) {
    case 'eq':
      return { $eq: node.value };
    case 'neq':
      return { $ne: node.value };
    case 'lt':
      return { $lt: node.value };
    case 'lte':
      return { $lte: node.value };
    case 'gt':
      return { $gt: node.value };
    case 'gte':
      return { $gte: node.value };
    case 'in':
      return { $in: [...(node.values ?? [])] };
    case 'notIn':
      return { $nin: [...(node.values ?? [])] };
    case 'isNull':
      return { $eq: null };
    case 'isNotNull':
      return { $ne: null };
    case 'contains':
      return {
        $regex: escapeRegex(String(node.value ?? '')),
        ...(cs ? {} : { $options: 'i' }),
      };
    case 'notContains':
      return {
        $not: {
          $regex: escapeRegex(String(node.value ?? '')),
          ...(cs ? {} : { $options: 'i' }),
        },
      };
    case 'startsWith':
      return {
        $regex: `^${escapeRegex(String(node.value ?? ''))}`,
        ...(cs ? {} : { $options: 'i' }),
      };
    case 'endsWith':
      return {
        $regex: `${escapeRegex(String(node.value ?? ''))}$`,
        ...(cs ? {} : { $options: 'i' }),
      };
    case 'between': {
      const [lo, hi] = node.values ?? [];
      return { $gte: lo, $lte: hi };
    }
    case 'notBetween': {
      const [lo, hi] = node.values ?? [];
      return { $not: { $gte: lo, $lte: hi } };
    }
  }
}

function compileSort(
  sort: ReadonlyArray<SortField>,
  collection: MongoCollectionDescriptor,
  direction: BlockRequest['direction'],
): Record<string, 1 | -1> {
  const out: Record<string, 1 | -1> = {};
  for (const field of sort) {
    requireField(field.columnId, collection);
    out[field.columnId] = field.direction === 'asc' ? 1 : -1;
  }
  // Tiebreaker on primary key. Direction matches all-DESC sorts or
  // `direction: 'before'`, otherwise ASC.
  const allDesc = sort.length > 0 && sort.every((s) => s.direction === 'desc');
  const reqBefore = direction === 'before';
  out[collection.primaryKey] = allDesc !== reqBefore ? -1 : 1;
  return out;
}

function compileProjection(
  cols: ReadonlyArray<string> | undefined,
  collection: MongoCollectionDescriptor,
): Record<string, 1> {
  if (!cols || cols.length === 0) {
    const out: Record<string, 1> = {};
    for (const f of collection.fields) out[f] = 1;
    if (!cols) out[collection.primaryKey] = 1;
    return out;
  }
  const out: Record<string, 1> = {};
  for (const c of cols) {
    requireField(c, collection);
    out[c] = 1;
  }
  return out;
}

function compileKeysetFilter(
  sort: ReadonlyArray<SortField>,
  cursor: KeysetCursor,
  collection: MongoCollectionDescriptor,
): Record<string, unknown> {
  // Keyset for Mongo: emit a chained $or that mirrors row-tuple
  // comparison semantics. For sort `[a ASC, b ASC]` and cursor
  // (vA, vB, vId), we want:
  //   a > vA
  //   OR (a = vA AND b > vB)
  //   OR (a = vA AND b = vB AND _id > vId)
  // This is what SQL's row comparison `(a, b, _id) > (vA, vB, vId)`
  // expands to in OR-form, which is what Mongo can index-scan
  // efficiently.
  const allDesc = sort.length > 0 && sort.every((s) => s.direction === 'desc');
  const cmp = allDesc ? '$lt' : '$gt';
  const sortAndPk: ReadonlyArray<{ field: string; value: unknown }> = [
    ...sort.map((s, i) => {
      requireField(s.columnId, collection);
      return { field: s.columnId, value: cursor.sortValues[i] ?? null };
    }),
    { field: collection.primaryKey, value: cursor.rowId },
  ];

  const orClauses: Record<string, unknown>[] = [];
  for (let i = 0; i < sortAndPk.length; i++) {
    const clause: Record<string, unknown> = {};
    for (let j = 0; j < i; j++) {
      clause[sortAndPk[j]!.field] = { $eq: sortAndPk[j]!.value };
    }
    clause[sortAndPk[i]!.field] = { [cmp]: sortAndPk[i]!.value };
    orClauses.push(clause);
  }
  return { $or: orClauses };
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function requireField(
  fieldId: string,
  collection: MongoCollectionDescriptor,
): void {
  if (fieldId === collection.primaryKey) return;
  if (!collection.fields.includes(fieldId)) {
    throw new Error(
      `@onegrid/mongo: unknown field "${fieldId}" (not in collection descriptor).`,
    );
  }
}

const KEYSET_PREFIX = 'ks:';

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
