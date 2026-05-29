// =============================================================================
// @onegrid/solid — createOneGrid primitive.
//
// Mirrors @onegrid/vue's composable and @onegrid/react's hook: a Grid
// is recreated ONLY on column-shape / theme / header / frozen-count
// change; every other update flows through Grid's imperative API.
//
// Solid's reactivity tracks reads inside `createMemo` / `createEffect`
// automatically — no shape-key needed for tracking, only for
// derivation. We still compute a stable shape key so width edits
// don't trip the recreate path (same race condition the React
// adapter documented; see its inline comment for the original
// discovery).
// =============================================================================

import {
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  type Accessor,
} from 'solid-js';
import { Grid } from '@onegrid/core';
import type { ColumnDef, GridOptions } from '@onegrid/core';

/** @public */
export type CreateOneGridOptions = Omit<GridOptions, 'host'>;

/** @public */
export interface CreateOneGridReturn {
  /** Attach to the host element via `<div ref={api.ref}>`. */
  readonly ref: (el: HTMLDivElement) => void;
  /** Live Grid instance once mounted, `null` until then. */
  readonly grid: Accessor<Grid | null>;
}

/**
 * Mount a Grid into a host `<div>`. Accepts a getter so Solid tracks
 * the property reads inside it — e.g.
 *
 * ```tsx
 * const [columns, setColumns] = createSignal<ColumnDef[]>([...]);
 * const api = createOneGrid(() => ({ columns: columns(), rowSource, rowHeight: 24 }));
 * return <div ref={api.ref} class="og-host" />;
 * ```
 *
 * @public
 */
export function createOneGrid(
  options: Accessor<CreateOneGridOptions>,
): CreateOneGridReturn {
  const [hostEl, setHostEl] = createSignal<HTMLDivElement | null>(null);
  const [grid, setGrid] = createSignal<Grid | null>(null);

  const columnsShape = createMemo(() => deriveColumnsShapeKey(options().columns));

  // Recreate trigger: host element + columns shape + theme + header
  // height + frozen-column count. `on(...)` makes Solid track ONLY
  // those reads — width edits inside options() don't fire here.
  createEffect(
    on(
      [
        hostEl,
        columnsShape,
        () => options().headerHeight,
        () => options().frozenColumnCount,
        () => options().theme,
      ],
      ([host]) => {
        const prev = grid();
        if (prev) {
          prev.destroy();
          setGrid(null);
        }
        if (!host) return;
        const o = options();
        if (o.columns.length === 0 || o.rowSource.numRows === 0) return;
        const instance = new Grid({
          ...o,
          host,
          // Late-bind every callback through the latest options() — Solid
          // tracks nothing here because reads happen at dispatch time.
          onFrame: (stats) => options().onFrame?.(stats),
          onSelectionChange: (s) => options().onSelectionChange?.(s),
          onHeaderClick: (id) => options().onHeaderClick?.(id),
          onCellEdit: (row, col, n, oldV) =>
            options().onCellEdit?.(row, col, n, oldV),
          onBeginEdit: (row, col) => options().onBeginEdit?.(row, col),
          onPaste: (row, col, rows) => options().onPaste?.(row, col, rows),
          onToggleExpand: (i) => options().onToggleExpand?.(i),
          getDetailContent: (i) => options().getDetailContent?.(i) ?? null,
          onDetailUnmount: (i, el) => options().onDetailUnmount?.(i, el),
          onFloatingFilterChange: (col, val) =>
            options().onFloatingFilterChange?.(col, val),
          getRowMeta: (row) => options().getRowMeta?.(row) ?? null,
          onToggleGroup: (path) => options().onToggleGroup?.(path),
          onColumnReorder: (from, to, id) =>
            options().onColumnReorder?.(from, to, id),
          onContextMenu: (target) => options().onContextMenu?.(target),
          onFillHandle: (source, fill) => options().onFillHandle?.(source, fill),
        });
        setGrid(instance);
      },
    ),
  );

  // Within-shape column updates (formatter / renderer / order-locked
  // edits) flow through setColumns. Width drag echoes deliberately
  // skip this path — see the React adapter's matching rationale.
  // `defer: true` skips the initial run — the Grid constructor
  // already received the initial columns / row source / pinned rows,
  // so there's nothing to push on first mount.
  createEffect(
    on(
      columnsShape,
      () => {
        grid()?.setColumns(options().columns);
      },
      { defer: true },
    ),
  );

  // Pass deps as array-of-getters so Solid compares each by identity
  // rather than the combined array (which would be a new reference
  // on every poll → false-positive change → mis-fire on first run
  // even with defer:true).
  createEffect(
    on(
      [() => options().rowSource, () => options().rowHeight],
      () => {
        grid()?.setRowSource(options().rowSource, options().rowHeight);
      },
      { defer: true },
    ),
  );

  createEffect(
    on(
      () => options().pinnedTopRowSource,
      () => grid()?.setPinnedTopRowSource(options().pinnedTopRowSource),
      { defer: true },
    ),
  );

  createEffect(
    on(
      () => options().pinnedBottomRowSource,
      () => grid()?.setPinnedBottomRowSource(options().pinnedBottomRowSource),
      { defer: true },
    ),
  );

  onCleanup(() => {
    const g = grid();
    if (g) g.destroy();
    setGrid(null);
  });

  return { ref: setHostEl, grid };
}

function deriveColumnsShapeKey(columns: ReadonlyArray<ColumnDef>): string {
  let s = '';
  for (let i = 0; i < columns.length; i++) {
    if (i > 0) s += '|';
    s += columns[i]?.id ?? '';
  }
  return s;
}
