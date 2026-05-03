// =============================================================================
// Aggregations
//
// Per-column reducers: sum, avg, count, countDistinct, min, max, first, last.
// Operate on either every row of a ColumnVector or a subset given as an
// Iterable<number> of row indices.
// =============================================================================

import type { Aggregation, AggregationType } from '@onegrid/protocol';
import type { ColumnTable, ColumnVector } from './column-table';

const BUILTIN_AGGREGATORS: Record<AggregationType, AggregatorFactory> = {
  sum: () => sumAggregator,
  avg: () => avgAggregator,
  count: () => countAggregator,
  countDistinct: () => countDistinctAggregator,
  min: () => minAggregator,
  max: () => maxAggregator,
  first: () => firstAggregator,
  last: () => lastAggregator,
};

export type AggregatorFn = (
  column: ColumnVector,
  rowIndices: Iterable<number> | null,
) => unknown;

export type AggregatorFactory = () => AggregatorFn;

const customRegistry = new Map<string, AggregatorFactory>();

/**
 * Register a custom aggregation under a string key. The Aggregation.fn field
 * is `string & {}`, so passing your custom key as `fn` will route through the
 * registry. Built-in keys are reserved.
 */
export function registerAggregator(key: string, factory: AggregatorFactory): void {
  if (key in BUILTIN_AGGREGATORS) {
    throw new Error(`registerAggregator: "${key}" is a built-in aggregation.`);
  }
  customRegistry.set(key, factory);
}

export function aggregate(
  table: ColumnTable,
  agg: Aggregation,
  rowIndices: Iterable<number> | null = null,
): unknown {
  if (!table.hasColumn(agg.columnId)) return null;
  const column = table.column(agg.columnId);
  const factory =
    BUILTIN_AGGREGATORS[agg.fn as AggregationType] ?? customRegistry.get(agg.fn);
  if (!factory) {
    throw new Error(`aggregate: unknown aggregation "${agg.fn}".`);
  }
  return factory()(column, rowIndices);
}

// -----------------------------------------------------------------------------
// Built-in aggregator implementations
// -----------------------------------------------------------------------------

const sumAggregator: AggregatorFn = (column, rowIndices) => {
  let sum = 0;
  for (const i of iterate(column, rowIndices)) {
    if (column.isNull(i)) continue;
    sum += toNumeric(column.get(i));
  }
  return sum;
};

const avgAggregator: AggregatorFn = (column, rowIndices) => {
  let sum = 0;
  let n = 0;
  for (const i of iterate(column, rowIndices)) {
    if (column.isNull(i)) continue;
    sum += toNumeric(column.get(i));
    n += 1;
  }
  return n === 0 ? null : sum / n;
};

const countAggregator: AggregatorFn = (column, rowIndices) => {
  let n = 0;
  for (const i of iterate(column, rowIndices)) {
    if (!column.isNull(i)) n += 1;
  }
  return n;
};

const countDistinctAggregator: AggregatorFn = (column, rowIndices) => {
  const seen = new Set<unknown>();
  for (const i of iterate(column, rowIndices)) {
    if (column.isNull(i)) continue;
    seen.add(column.get(i));
  }
  return seen.size;
};

const minAggregator: AggregatorFn = (column, rowIndices) => {
  let acc: unknown = null;
  for (const i of iterate(column, rowIndices)) {
    if (column.isNull(i)) continue;
    const v = column.get(i);
    if (acc === null || compareValues(v, acc) < 0) acc = v;
  }
  return acc;
};

const maxAggregator: AggregatorFn = (column, rowIndices) => {
  let acc: unknown = null;
  for (const i of iterate(column, rowIndices)) {
    if (column.isNull(i)) continue;
    const v = column.get(i);
    if (acc === null || compareValues(v, acc) > 0) acc = v;
  }
  return acc;
};

const firstAggregator: AggregatorFn = (column, rowIndices) => {
  for (const i of iterate(column, rowIndices)) {
    if (!column.isNull(i)) return column.get(i);
  }
  return null;
};

const lastAggregator: AggregatorFn = (column, rowIndices) => {
  let last: unknown = null;
  for (const i of iterate(column, rowIndices)) {
    if (!column.isNull(i)) last = column.get(i);
  }
  return last;
};

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function* iterate(
  column: ColumnVector,
  rowIndices: Iterable<number> | null,
): Generator<number> {
  if (rowIndices === null) {
    for (let i = 0; i < column.length; i++) yield i;
    return;
  }
  yield* rowIndices;
}

function compareValues(a: unknown, b: unknown): number {
  if (typeof a === 'string' || typeof b === 'string') {
    const sa = String(a ?? '');
    const sb = String(b ?? '');
    if (sa < sb) return -1;
    if (sa > sb) return 1;
    return 0;
  }
  const an = toNumeric(a);
  const bn = toNumeric(b);
  if (an < bn) return -1;
  if (an > bn) return 1;
  return 0;
}

function toNumeric(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v.getTime();
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}
