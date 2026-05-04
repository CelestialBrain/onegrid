// =============================================================================
// Distinct-value enumeration with counts.
//
// Used by set-filter UIs: "show me a checkbox list of every distinct
// value in this column with how many rows have it." Single pass over
// the column, hashing into a Map. Returns the result sorted by count
// descending so the most-common values appear first in the UI.
//
// For 10M+ rows on a low-cardinality column, this is dominated by
// hash-map insertion (~500ms for 10M unique strings on M-class
// hardware). When that becomes interactive-blocking, callers can fall
// back to enumerateDistinctChunked() which yields between batches via
// the supplied scheduler — useful for `requestIdleCallback`-driven
// progressive set-filter UIs.
// =============================================================================

import type { ColumnTable } from './column-table';

export interface DistinctValue {
  readonly value: unknown;
  readonly count: number;
}

export interface EnumerateDistinctOptions {
  /** Subset of source rows to include (e.g. only rows that already
   *  pass other filters). Defaults to every row. */
  readonly rowFilter?: (rowIndex: number) => boolean;
  /** Cap the result; null = no cap. Default 10000. */
  readonly limit?: number | null;
}

/**
 * Single-pass distinct enumeration. Returns up to `limit` entries
 * sorted by count descending, then by value ascending for stable
 * ordering. Null cells are bucketed under `value === null`.
 */
export function enumerateDistinct(
  table: ColumnTable,
  columnId: string,
  options: EnumerateDistinctOptions = {},
): DistinctValue[] {
  const limit = options.limit === undefined ? 10000 : options.limit;
  const filter = options.rowFilter;
  const column = table.column(columnId);
  const counts = new Map<unknown, number>();

  for (let i = 0; i < table.numRows; i++) {
    if (filter && !filter(i)) continue;
    const v = column.isNull(i) ? null : column.get(i);
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }

  const out: DistinctValue[] = [];
  for (const [value, count] of counts) out.push({ value, count });
  out.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return compareValues(a.value, b.value);
  });
  return limit === null ? out : out.slice(0, limit);
}

/**
 * Async incremental enumerator. Yields between fixed-size batches so
 * the main thread can paint between chunks. The scheduler defaults to
 * `requestIdleCallback` when available, falling back to
 * `setTimeout(0)` (Safari + jsdom). Each `onProgress` call receives the
 * partial result so the UI can show "1,234 of ~5,678" without waiting
 * for the full pass.
 */
export async function enumerateDistinctChunked(
  table: ColumnTable,
  columnId: string,
  options: EnumerateDistinctOptions & {
    readonly batchSize?: number;
    readonly onProgress?: (partial: DistinctValue[], rowsScanned: number) => void;
  } = {},
): Promise<DistinctValue[]> {
  const batchSize = options.batchSize ?? 50_000;
  const limit = options.limit === undefined ? 10000 : options.limit;
  const filter = options.rowFilter;
  const column = table.column(columnId);
  const counts = new Map<unknown, number>();
  const total = table.numRows;
  const yieldOnce = (): Promise<void> =>
    new Promise((resolve) => {
      const idle = (
        globalThis as unknown as {
          requestIdleCallback?: (cb: () => void) => void;
        }
      ).requestIdleCallback;
      if (idle) idle(() => resolve());
      else setTimeout(resolve, 0);
    });

  for (let start = 0; start < total; start += batchSize) {
    const end = Math.min(total, start + batchSize);
    for (let i = start; i < end; i++) {
      if (filter && !filter(i)) continue;
      const v = column.isNull(i) ? null : column.get(i);
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    if (options.onProgress) {
      const partial: DistinctValue[] = [];
      for (const [value, count] of counts) partial.push({ value, count });
      options.onProgress(partial, end);
    }
    if (end < total) await yieldOnce();
  }

  const out: DistinctValue[] = [];
  for (const [value, count] of counts) out.push({ value, count });
  out.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return compareValues(a.value, b.value);
  });
  return limit === null ? out : out.slice(0, limit);
}

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}
