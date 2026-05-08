// =============================================================================
// SsrmTreeSource
//
// Hierarchical row source for SSRM. Bridges an async DataSource (with
// `parentId`-aware `fetchBlock`) to the synchronous RowSource the canvas
// renderer needs. Children of every node are fetched on demand: clicking
// a chevron toggles open state; the first toggle for a node kicks off
// `fetchBlock({ parentId: node.id, ... })` and the row count grows once
// the response lands.
//
// Internal state:
//   - `childrenById`: cached children rows keyed by parent id
//                     (root level uses the sentinel ROOT_KEY)
//   - `openIds`: set of node ids currently expanded
//   - `inflight`: deduplicates concurrent fetches per parent
//
// The flattened view is recomputed every time the open set or any
// children list changes (cheap — children counts are typically
// hundreds, not millions). Each visible row maps to a `FlatEntry`
// holding the source row data + depth + id + hasChildren so getRowMeta
// and getCell are O(1).
//
// Design choice: we deliberately do NOT support paginated children
// blocks here yet. The first version assumes each parent's children
// fit in a single block (`limit` raised by the caller). Pagination per
// parent is a v0.0.8 follow-up — it requires range cursor tracking and
// an "is-loading-more" UI affordance.
// =============================================================================

import type {
  BlockRequest,
  BlockResponse,
  DataSource,
  FilterModel,
  HierarchyEntry,
  SortModel,
} from '@onegrid/protocol';
import type { ArrowDecoder, RowSource } from './row-source';

const ROOT_KEY = '__onegrid_root__';

/** Per-row metadata the consumer can read via `getRowMeta`. */
export interface SsrmTreeRowMeta {
  readonly kind: 'tree';
  readonly depth: number;
  readonly id: string;
  readonly expanded: boolean;
  readonly isLeaf: boolean;
  readonly hasChildren: boolean;
}

export interface SsrmTreeSourceOptions {
  /** Rows per parent block. Default 500 — plenty for most trees. */
  readonly blockSize?: number;
  /** Initial sort applied to children fetches. */
  readonly initialSort?: SortModel;
  /** Initial filter applied to children fetches. */
  readonly initialFilter?: FilterModel;
  /** Called whenever a fetch resolves or open state changes. */
  readonly onUpdate?: () => void;
  /** Placeholder returned for not-yet-loaded cells. */
  readonly placeholder?: unknown;
  /** Optional Arrow IPC decoder. See `ArrowDecoder` in row-source.ts
   *  for the recommended apache-arrow recipe. */
  readonly decodeArrowIpc?: ArrowDecoder;
}

export interface SsrmTreeSourceHandle extends RowSource {
  /** Returns the metadata for a visual row (depth, id, hasChildren, etc.). */
  readonly getRowMeta: (rowIndex: number) => SsrmTreeRowMeta | null;
  /** Toggle a node by id. Triggers a children fetch on first open. */
  readonly toggle: (id: string) => void;
  /** Force-evict the cached children of a node (next open re-fetches). */
  readonly invalidate: (id: string) => void;
  /** Current count of cached parents (for telemetry). */
  readonly getCacheSize: () => number;
}

interface CachedChildren {
  readonly rows: ReadonlyArray<Record<string, unknown>>;
  readonly hierarchy: ReadonlyArray<HierarchyEntry>;
}

interface FlatEntry {
  readonly id: string;
  readonly depth: number;
  readonly hasChildren: boolean;
  readonly row: Record<string, unknown>;
}

export function createSsrmTreeSource(
  dataSource: DataSource,
  options: SsrmTreeSourceOptions = {},
): SsrmTreeSourceHandle {
  const blockSize = options.blockSize ?? 500;
  const placeholder = options.placeholder ?? '…';
  const sort = options.initialSort ?? [];
  const filter = options.initialFilter ?? null;
  const decodeArrow = options.decodeArrowIpc;

  const childrenById = new Map<string, CachedChildren>();
  const inflight = new Map<string, Promise<void>>();
  const openIds = new Set<string>();
  let flat: FlatEntry[] = [];

  function fetchChildren(parentKey: string): void {
    if (childrenById.has(parentKey) || inflight.has(parentKey)) return;
    const req: BlockRequest = {
      cursor: null,
      direction: 'after',
      limit: blockSize,
      sort,
      filter,
      parentId: parentKey === ROOT_KEY ? null : parentKey,
    };
    const promise = dataSource
      .fetchBlock(req)
      .then((res) => {
        const rows = decodeRows(res, decodeArrow);
        const hierarchy = res.hierarchy ?? rows.map(() => ({ id: '', hasChildren: false }));
        childrenById.set(parentKey, { rows, hierarchy });
        rebuildFlat();
        options.onUpdate?.();
      })
      .catch(() => {
        // Leave parent uncached so retry works on next toggle.
      })
      .finally(() => {
        inflight.delete(parentKey);
      });
    inflight.set(parentKey, promise);
  }

  // Walk the cached children top-down respecting `openIds`. Children for
  // any parent that hasn't loaded yet are skipped — the row will appear
  // once the fetch lands and rebuildFlat runs again.
  function rebuildFlat(): void {
    const out: FlatEntry[] = [];
    const root = childrenById.get(ROOT_KEY);
    if (!root) {
      flat = out;
      return;
    }
    walk(root, 0, out);
    flat = out;
  }

  function walk(level: CachedChildren, depth: number, out: FlatEntry[]): void {
    for (let i = 0; i < level.rows.length; i++) {
      const row = level.rows[i];
      const meta = level.hierarchy[i];
      if (!row || !meta) continue;
      out.push({
        id: meta.id,
        depth,
        hasChildren: meta.hasChildren,
        row,
      });
      if (meta.hasChildren && openIds.has(meta.id)) {
        const child = childrenById.get(meta.id);
        if (child) walk(child, depth + 1, out);
      }
    }
  }

  // Initial root fetch — the consumer sees an empty grid until the
  // response lands and onUpdate fires.
  fetchChildren(ROOT_KEY);

  function getCell(rowIndex: number, columnId: string): unknown {
    const entry = flat[rowIndex];
    if (!entry) return placeholder;
    return entry.row[columnId];
  }

  function getRowMeta(rowIndex: number): SsrmTreeRowMeta | null {
    const entry = flat[rowIndex];
    if (!entry) return null;
    const expanded = openIds.has(entry.id);
    return {
      kind: 'tree',
      depth: entry.depth,
      id: entry.id,
      expanded,
      isLeaf: !entry.hasChildren,
      hasChildren: entry.hasChildren,
    };
  }

  function toggle(id: string): void {
    if (openIds.has(id)) {
      openIds.delete(id);
      rebuildFlat();
      options.onUpdate?.();
      return;
    }
    openIds.add(id);
    if (!childrenById.has(id)) {
      // Fetch synchronously kicks off; rebuildFlat runs on resolve.
      fetchChildren(id);
      // Still rebuild now to reflect "expanded" state on the parent
      // chevron; children appear when the fetch lands.
      rebuildFlat();
      options.onUpdate?.();
      return;
    }
    rebuildFlat();
    options.onUpdate?.();
  }

  function invalidate(id: string): void {
    childrenById.delete(id);
    rebuildFlat();
    options.onUpdate?.();
  }

  return {
    get numRows(): number {
      return flat.length;
    },
    getCell,
    getRowMeta,
    toggle,
    invalidate,
    getCacheSize: () => childrenById.size,
  };
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
        'createSsrmTreeSource: server returned arrow-ipc but no `decodeArrowIpc` option was provided.',
      );
    }
    const bytes = response.rows as unknown as Uint8Array;
    return decodeArrow(bytes);
  }
  throw new Error(
    `createSsrmTreeSource: unknown encoding "${String(response.encoding)}".`,
  );
}
