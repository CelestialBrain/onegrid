// =============================================================================
// SsrmRowSource
//
// Bridges an async DataSource (server-side row model) to the synchronous
// RowSource interface the canvas renderer needs. Maintains a block cache;
// on `getCell(row, col)` cache miss, kicks off a fetch and returns a
// placeholder. When the fetch resolves, calls onUpdate so the renderer
// can re-render the now-populated row.
//
// Block size is configurable; default 200 rows per block. Concurrent
// fetches for the same block are deduplicated.
//
// Cursor strategy: this row source uses offset-encoded cursors
// (`offset:N`) so it can jump directly to any row index without walking
// forward block-by-block. Servers that want to use this row source must
// recognize this cursor format. For pure keyset cursors (production
// SSRM), use the SsrmDataSource directly with a paginating UI rather
// than via this synchronous adapter.
// =============================================================================

import type {
  BlockRequest,
  BlockResponse,
  DataSource,
  FilterModel,
  SortModel,
} from '@onegrid/protocol';

export interface RowSource {
  readonly numRows: number;
  readonly getCell: (rowIndex: number, columnId: string) => unknown;
}

export interface SsrmRowSourceOptions {
  /** Total number of rows in the dataset. The server-side query result. */
  readonly numRows: number;
  /** Rows per block. Default 200. */
  readonly blockSize?: number;
  /** Called whenever a block lands so the renderer can re-render. */
  readonly onUpdate?: () => void;
  /** Placeholder value returned for not-yet-loaded cells. Default: '…'. */
  readonly placeholder?: unknown;
  /** Initial sort. Defaults to []. */
  readonly initialSort?: SortModel;
  /** Initial filter. Defaults to null. */
  readonly initialFilter?: FilterModel;
}

export interface SsrmRowSourceHandle extends RowSource {
  /** Force-evict a block (e.g., after a mutation invalidates it). */
  readonly invalidateBlock: (blockIndex: number) => void;
  /** Drop everything; next access re-fetches. */
  readonly invalidateAll: () => void;
  /** Number of blocks currently in cache (for telemetry). */
  readonly getCacheSize: () => number;
  /** Replace the active sort. Drops all cached blocks and refetches on
   *  next read — invariant: blocks fetched under sort A aren't valid under
   *  sort B. */
  readonly setSort: (sort: SortModel) => void;
  /** Replace the active filter. Same cache invalidation as setSort. */
  readonly setFilter: (filter: FilterModel) => void;
  /** Update the total row count (e.g., after a filter narrows the result). */
  readonly setNumRows: (numRows: number) => void;
}

interface CachedBlock {
  rows: ReadonlyArray<Record<string, unknown>>;
}

export function createSsrmRowSource(
  dataSource: DataSource,
  options: SsrmRowSourceOptions,
): SsrmRowSourceHandle {
  const blockSize = options.blockSize ?? 200;
  const placeholder = options.placeholder ?? '…';
  const blocks = new Map<number, CachedBlock>();
  const inflight = new Map<number, Promise<void>>();
  let currentSort: SortModel = options.initialSort ?? [];
  let currentFilter: FilterModel = options.initialFilter ?? null;
  let currentNumRows = options.numRows;

  function fetchBlock(blockIndex: number): void {
    if (blocks.has(blockIndex) || inflight.has(blockIndex)) return;
    const startRow = blockIndex * blockSize;
    const req: BlockRequest = {
      cursor: startRow === 0 ? null : `offset:${String(startRow)}`,
      direction: 'after',
      limit: blockSize,
      sort: currentSort,
      filter: currentFilter,
    };
    const promise = dataSource
      .fetchBlock(req)
      .then((res) => {
        const rows = ensureJsonRows(res);
        blocks.set(blockIndex, { rows });
        // Server-authoritative row count: when the result set narrows
        // (e.g. filter applied) the response carries the new total. The
        // renderer reads currentNumRows via the handle's numRows getter
        // and resizes its scroll spacer on the next render frame.
        if (res.totalRowCount !== undefined && res.totalRowCount !== currentNumRows) {
          currentNumRows = res.totalRowCount;
        }
        options.onUpdate?.();
      })
      .catch(() => {
        // Leave the block uncached; next read will retry.
      })
      .finally(() => {
        inflight.delete(blockIndex);
      });
    inflight.set(blockIndex, promise);
  }

  function getCell(rowIndex: number, columnId: string): unknown {
    if (rowIndex < 0 || rowIndex >= currentNumRows) return undefined;
    const blockIndex = Math.floor(rowIndex / blockSize);
    const block = blocks.get(blockIndex);
    if (!block) {
      fetchBlock(blockIndex);
      return placeholder;
    }
    const row = block.rows[rowIndex - blockIndex * blockSize];
    if (!row) return placeholder;
    return row[columnId];
  }

  function invalidateAll(): void {
    blocks.clear();
    inflight.clear();
  }

  const handle: SsrmRowSourceHandle = {
    get numRows(): number {
      return currentNumRows;
    },
    getCell,
    invalidateBlock: (blockIndex) => {
      blocks.delete(blockIndex);
    },
    invalidateAll,
    getCacheSize: () => blocks.size,
    setSort: (sort) => {
      currentSort = sort;
      invalidateAll();
      options.onUpdate?.();
    },
    setFilter: (filter) => {
      currentFilter = filter;
      invalidateAll();
      options.onUpdate?.();
    },
    setNumRows: (n) => {
      currentNumRows = n;
      options.onUpdate?.();
    },
  };
  return handle;
}

function ensureJsonRows(
  response: BlockResponse,
): ReadonlyArray<Record<string, unknown>> {
  if (response.encoding !== 'json') {
    // Arrow IPC support is on the roadmap; for now, throw if we get bytes back.
    throw new Error('createSsrmRowSource: arrow-ipc encoding not yet supported here.');
  }
  return response.rows as ReadonlyArray<Record<string, unknown>>;
}
