// =============================================================================
// sortIndex
//
// Stable multi-column sort over a ColumnTable. Returns an Int32Array
// permutation: `result[i]` is the source row index that should appear at
// position `i` in the sorted view.
//
// Permutation arrays compose cleanly with row virtualization: the renderer
// reads cells via `table.column(id).get(perm[visibleRow])`. No data copy.
// =============================================================================

import type { SortField, SortModel } from '@onegrid/protocol';
import type { ColumnTable, ColumnVector } from './column-table';

export interface SortOptions {
  /**
   * Optional locale for string comparison. Defaults to undefined → uses the
   * runtime default. Pass a locale to get language-aware ordering.
   */
  readonly locale?: string;
}

export function sortIndex(
  table: ColumnTable,
  sort: SortModel,
  options: SortOptions = {},
): Int32Array {
  const n = table.numRows;
  const perm = new Int32Array(n);
  for (let i = 0; i < n; i++) perm[i] = i;

  if (sort.length === 0) return perm;

  const fields = sort.map((f) => ({
    field: f,
    column: table.column(f.columnId),
    compare: comparatorFor(table.column(f.columnId), f, options),
  }));

  // Sort an Array<number> view of the permutation buffer because Int32Array
  // doesn't preserve stability under V8's TimSort fallback for small types.
  // We materialise back into the typed array after.
  const tmp = Array.from(perm);
  tmp.sort((aIdx, bIdx) => {
    for (let k = 0; k < fields.length; k++) {
      const cmp = fields[k]!.compare(aIdx, bIdx);
      if (cmp !== 0) return cmp;
    }
    return 0;
  });
  for (let i = 0; i < n; i++) perm[i] = tmp[i] ?? 0;
  return perm;
}

type Comparator = (aIdx: number, bIdx: number) => number;

function comparatorFor(
  column: ColumnVector,
  field: SortField,
  options: SortOptions,
): Comparator {
  const direction = field.direction === 'desc' ? -1 : 1;
  const nullsLast = (field.nulls ?? 'last') === 'last';

  const type = column.schema.type;
  const baseCompare =
    type === 'utf8' ? makeStringCompare(options.locale) : makeNumericCompare();

  return (aIdx, bIdx) => {
    const aNull = column.isNull(aIdx);
    const bNull = column.isNull(bIdx);
    if (aNull && bNull) return 0;
    if (aNull) return nullsLast ? 1 : -1;
    if (bNull) return nullsLast ? -1 : 1;
    return baseCompare(column.get(aIdx), column.get(bIdx)) * direction;
  };
}

function makeStringCompare(locale?: string): (a: unknown, b: unknown) => number {
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'variant' });
  return (a, b) => collator.compare(String(a), String(b));
}

function makeNumericCompare(): (a: unknown, b: unknown) => number {
  return (a, b) => {
    const av = a as number | bigint | Date | boolean | null | undefined;
    const bv = b as number | bigint | Date | boolean | null | undefined;
    const an = toNumeric(av);
    const bn = toNumeric(bv);
    if (an < bn) return -1;
    if (an > bn) return 1;
    return 0;
  };
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
