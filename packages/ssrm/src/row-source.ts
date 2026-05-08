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

/**
 * Decode an Arrow IPC byte stream into a JS row array. Adapter authors
 * who emit `BlockResponse.encoding === 'arrow-ipc'` plug in a decoder
 * here so the row source can hydrate cells out of the stream.
 *
 * Recommended impl (using `apache-arrow`):
 *
 * ```ts
 * import { tableFromIPC } from 'apache-arrow';
 * const decodeArrowIpc: ArrowDecoder = (bytes) => {
 *   const table = tableFromIPC(bytes);
 *   return table.toArray().map((row) => row.toJSON()); // or use raw fields
 * };
 * ```
 *
 * The row source intentionally does NOT bundle `apache-arrow` so that
 * JSON-only deployments stay small. If you don't supply a decoder and
 * the server emits Arrow IPC, the row source throws.
 */
export type ArrowDecoder = (
  bytes: Uint8Array,
) => ReadonlyArray<Record<string, unknown>>;

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
  /** Optional Arrow IPC decoder. When the server emits responses with
   *  `encoding === 'arrow-ipc'`, the row source delegates to this
   *  function to materialize rows. Omit when you only consume JSON
   *  responses. */
  readonly decodeArrowIpc?: ArrowDecoder;
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
  const decodeArrow = options.decodeArrowIpc;
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
        const rows = decodeRows(res, decodeArrow);
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

function decodeRows(
  response: BlockResponse,
  decodeArrow: ArrowDecoder | undefined,
): ReadonlyArray<Record<string, unknown>> {
  if (response.encoding === 'json') {
    return response.rows as ReadonlyArray<Record<string, unknown>>;
  }
  if (response.encoding === 'arrow-ipc') {
    if (!decodeArrow) {
      throw new Error(
        'createSsrmRowSource: server returned arrow-ipc but no `decodeArrowIpc` option was provided.',
      );
    }
    const bytes = response.rows as unknown as Uint8Array;
    return decodeArrow(bytes);
  }
  throw new Error(
    `createSsrmRowSource: unknown encoding "${String(response.encoding)}".`,
  );
}
