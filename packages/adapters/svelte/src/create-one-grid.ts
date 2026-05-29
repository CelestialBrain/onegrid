// =============================================================================
// @onegrid/svelte — createOneGrid factory.
//
// Store-based (Svelte 4 / 5 compatible) factory that mirrors the
// React + Vue + Solid contract: a Grid is recreated ONLY on column-
// shape / theme / header / frozen-count change; every other update
// flows through Grid's imperative API.
//
// Svelte 5 consumers can pair this with the runes API in their own
// component code (e.g. wrap the `options` store in $state-driven
// derivations); the adapter itself stays rune-free so it builds with
// stock tsup + tsc.
// =============================================================================

import { writable, type Readable, type Writable } from 'svelte/store';
import { Grid } from '@onegrid/core';
import type { ColumnDef, GridOptions } from '@onegrid/core';

/** @public */
export type CreateOneGridOptions = Omit<GridOptions, 'host'>;

/** @public */
export interface CreateOneGridReturn {
  /**
   * Action to attach to the host `<div>`:
   *
   * ```svelte
   * <div use:api.attach class="og-host" />
   * ```
   *
   * Returns the Svelte action contract (`{ destroy }`).
   */
  readonly attach: (node: HTMLDivElement) => { destroy: () => void };
  /** Live Grid instance once mounted; `null` until then. */
  readonly grid: Readable<Grid | null>;
  /**
   * Push a fresh options object. Internal effects compare against the
   * previous snapshot and either recreate (shape changed) or fan out
   * through the Grid's imperative API.
   */
  readonly setOptions: (next: CreateOneGridOptions) => void;
  /** Tear down the Grid + cancel subscriptions. Idempotent. */
  readonly destroy: () => void;
}

/**
 * Create a Grid controller. The factory takes the initial options;
 * subsequent changes flow through `setOptions(...)`. This deliberately
 * mirrors how a Svelte `<script>` block would wrap a `$:` reactive
 * statement around the call site:
 *
 * ```svelte
 * <script lang="ts">
 *   import { createOneGrid } from '@onegrid/svelte';
 *   const api = createOneGrid({ columns, rowSource, rowHeight: 24 });
 *   $: api.setOptions({ columns, rowSource, rowHeight: 24 });
 * </script>
 * <div use:api.attach class="og-host" />
 * ```
 *
 * @public
 */
export function createOneGrid(initial: CreateOneGridOptions): CreateOneGridReturn {
  let host: HTMLDivElement | null = null;
  let opts: CreateOneGridOptions = initial;
  let prevShape: string = deriveColumnsShapeKey(initial.columns);
  let prevHeaderHeight: number | undefined = initial.headerHeight;
  let prevFrozen: number | undefined = initial.frozenColumnCount;
  let prevTheme: unknown = initial.theme;
  let prevRowSource: unknown = initial.rowSource;
  let prevRowHeight: unknown = initial.rowHeight;
  let prevPinnedTop: unknown = initial.pinnedTopRowSource;
  let prevPinnedBottom: unknown = initial.pinnedBottomRowSource;

  const gridStore: Writable<Grid | null> = writable(null);

  function maybeMount(): void {
    if (!host) return;
    if (opts.columns.length === 0 || opts.rowSource.numRows === 0) return;
    // Capture `opts` in the late-bind closures so callback identity
    // changes propagate to the next dispatch without recreation.
    const instance = new Grid({
      ...opts,
      host,
      onFrame: (stats) => opts.onFrame?.(stats),
      onSelectionChange: (s) => opts.onSelectionChange?.(s),
      onHeaderClick: (id) => opts.onHeaderClick?.(id),
      onCellEdit: (row, col, n, oldV) => opts.onCellEdit?.(row, col, n, oldV),
      onBeginEdit: (row, col) => opts.onBeginEdit?.(row, col),
      onPaste: (row, col, rows) => opts.onPaste?.(row, col, rows),
      onToggleExpand: (i) => opts.onToggleExpand?.(i),
      getDetailContent: (i) => opts.getDetailContent?.(i) ?? null,
      onDetailUnmount: (i, el) => opts.onDetailUnmount?.(i, el),
      onFloatingFilterChange: (col, val) =>
        opts.onFloatingFilterChange?.(col, val),
      getRowMeta: (row) => opts.getRowMeta?.(row) ?? null,
      onToggleGroup: (path) => opts.onToggleGroup?.(path),
      onColumnReorder: (from, to, id) => opts.onColumnReorder?.(from, to, id),
      onContextMenu: (target) => opts.onContextMenu?.(target),
      onFillHandle: (source, fill) => opts.onFillHandle?.(source, fill),
    });
    gridStore.set(instance);
  }

  function teardown(): void {
    let current: Grid | null = null;
    gridStore.update((g) => {
      current = g;
      return null;
    });
    if (current) (current as Grid).destroy();
  }

  function recreate(): void {
    teardown();
    maybeMount();
  }

  function attach(node: HTMLDivElement): { destroy: () => void } {
    host = node;
    maybeMount();
    return {
      destroy() {
        teardown();
        host = null;
      },
    };
  }

  function setOptions(next: CreateOneGridOptions): void {
    opts = next;
    const shape = deriveColumnsShapeKey(next.columns);
    const shapeChanged = shape !== prevShape;
    const headerChanged = next.headerHeight !== prevHeaderHeight;
    const frozenChanged = next.frozenColumnCount !== prevFrozen;
    const themeChanged = next.theme !== prevTheme;

    if (shapeChanged || headerChanged || frozenChanged || themeChanged) {
      prevShape = shape;
      prevHeaderHeight = next.headerHeight;
      prevFrozen = next.frozenColumnCount;
      prevTheme = next.theme;
      prevRowSource = next.rowSource;
      prevRowHeight = next.rowHeight;
      prevPinnedTop = next.pinnedTopRowSource;
      prevPinnedBottom = next.pinnedBottomRowSource;
      recreate();
      return;
    }

    // Imperative fan-out — each branch fires only when its slice
    // actually changed, mirroring the React adapter's effect graph.
    let current: Grid | null = null;
    gridStore.subscribe((g) => {
      current = g;
    })();
    if (!current) return;

    if (next.rowSource !== prevRowSource || next.rowHeight !== prevRowHeight) {
      prevRowSource = next.rowSource;
      prevRowHeight = next.rowHeight;
      (current as Grid).setRowSource(next.rowSource, next.rowHeight);
    }
    if (next.pinnedTopRowSource !== prevPinnedTop) {
      prevPinnedTop = next.pinnedTopRowSource;
      (current as Grid).setPinnedTopRowSource(next.pinnedTopRowSource);
    }
    if (next.pinnedBottomRowSource !== prevPinnedBottom) {
      prevPinnedBottom = next.pinnedBottomRowSource;
      (current as Grid).setPinnedBottomRowSource(next.pinnedBottomRowSource);
    }
    // Note: within-shape column edits (e.g. formatter swap on identity
    // change of `columns` but same shape) intentionally do NOT echo to
    // setColumns here. Width-drag round-trips would race the live drag;
    // see the React adapter's matching rationale.
  }

  return { attach, grid: gridStore, setOptions, destroy: teardown };
}

function deriveColumnsShapeKey(columns: ReadonlyArray<ColumnDef>): string {
  let s = '';
  for (let i = 0; i < columns.length; i++) {
    if (i > 0) s += '|';
    s += columns[i]?.id ?? '';
  }
  return s;
}
