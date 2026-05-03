// =============================================================================
// filterIndex
//
// Evaluates a FilterModel against a ColumnTable and returns a BitmapSelection
// of rows that match. Logical operators (and/or/not) recurse on sub-bitmaps;
// comparison operators evaluate column values per row.
//
// Time complexity: O(rows × leaf_filter_count). Designed to support 1M+ row
// in-memory filters with typical sub-100ms evaluation; deeper trees of
// disjunctions get linearly slower.
// =============================================================================

import type {
  ComparisonFilter,
  FilterModel,
  FilterNode,
  LogicalFilter,
} from '@onegrid/protocol';
import type { ColumnTable, ColumnVector } from './column-table';
import { BitmapSelection } from './selection';

export interface FilterOptions {
  readonly locale?: string;
}

export function filterIndex(
  table: ColumnTable,
  filter: FilterModel,
  options: FilterOptions = {},
): BitmapSelection {
  if (filter === null) {
    return new BitmapSelection(table.numRows, 'full');
  }
  return evaluateNode(table, filter, options);
}

function evaluateNode(
  table: ColumnTable,
  node: FilterNode,
  options: FilterOptions,
): BitmapSelection {
  if (node.type === 'comparison') {
    return evaluateComparison(table, node, options);
  }
  return evaluateLogical(table, node, options);
}

function evaluateLogical(
  table: ColumnTable,
  node: LogicalFilter,
  options: FilterOptions,
): BitmapSelection {
  if (node.op === 'not') {
    const inner = node.filters[0];
    if (!inner) return new BitmapSelection(table.numRows, 'full');
    return evaluateNode(table, inner, options).invert();
  }
  if (node.filters.length === 0) {
    // empty AND = all match; empty OR = none match.
    return new BitmapSelection(table.numRows, node.op === 'and' ? 'full' : 'empty');
  }
  let result = evaluateNode(table, node.filters[0]!, options);
  for (let i = 1; i < node.filters.length; i++) {
    const next = evaluateNode(table, node.filters[i]!, options);
    result = node.op === 'and' ? result.intersect(next) : result.union(next);
  }
  return result;
}

function evaluateComparison(
  table: ColumnTable,
  node: ComparisonFilter,
  options: FilterOptions,
): BitmapSelection {
  if (!table.hasColumn(node.columnId)) {
    return new BitmapSelection(table.numRows, 'empty');
  }
  const column = table.column(node.columnId);
  const sel = new BitmapSelection(table.numRows, 'empty');
  const test = makePredicate(column, node, options);
  for (let i = 0; i < table.numRows; i++) {
    if (test(i)) sel.add(i);
  }
  return sel;
}

type Predicate = (rowIndex: number) => boolean;

function makePredicate(
  column: ColumnVector,
  node: ComparisonFilter,
  options: FilterOptions,
): Predicate {
  const op = node.op;
  const cs = node.caseSensitive ?? false;
  const collator = new Intl.Collator(options.locale, {
    numeric: true,
    sensitivity: cs ? 'variant' : 'accent',
  });

  if (op === 'isNull') return (i) => column.isNull(i);
  if (op === 'isNotNull') return (i) => !column.isNull(i);

  const target = node.value;
  const targets = node.values ?? [];

  if (op === 'in') {
    const set = new Set(targets);
    return (i) => !column.isNull(i) && set.has(column.get(i));
  }
  if (op === 'notIn') {
    const set = new Set(targets);
    return (i) => !column.isNull(i) && !set.has(column.get(i));
  }
  if (op === 'between' || op === 'notBetween') {
    const [lo, hi] = targets as [unknown, unknown];
    return (i) => {
      if (column.isNull(i)) return false;
      const v = column.get(i);
      const inRange = compareValues(v, lo, collator) >= 0 && compareValues(v, hi, collator) <= 0;
      return op === 'between' ? inRange : !inRange;
    };
  }

  if (op === 'contains' || op === 'notContains' || op === 'startsWith' || op === 'endsWith') {
    const needleRaw = String(target ?? '');
    const needle = cs ? needleRaw : needleRaw.toLowerCase();
    return (i) => {
      if (column.isNull(i)) return false;
      const hayRaw = String(column.get(i) ?? '');
      const hay = cs ? hayRaw : hayRaw.toLowerCase();
      const result =
        op === 'contains' || op === 'notContains'
          ? hay.includes(needle)
          : op === 'startsWith'
            ? hay.startsWith(needle)
            : hay.endsWith(needle);
      return op === 'notContains' ? !result : result;
    };
  }

  // Numeric / date / boolean comparisons via a unified compare.
  return (i) => {
    if (column.isNull(i)) return false;
    const v = column.get(i);
    const cmp = compareValues(v, target, collator);
    switch (op) {
      case 'eq':
        return cmp === 0;
      case 'neq':
        return cmp !== 0;
      case 'lt':
        return cmp < 0;
      case 'lte':
        return cmp <= 0;
      case 'gt':
        return cmp > 0;
      case 'gte':
        return cmp >= 0;
      default:
        return false;
    }
  };
}

function compareValues(a: unknown, b: unknown, collator: Intl.Collator): number {
  if (typeof a === 'string' || typeof b === 'string') {
    return collator.compare(String(a ?? ''), String(b ?? ''));
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
