// =============================================================================
// @onegrid/vue — useOneGrid composable.
//
// Mirrors @onegrid/react's hook: mount a Grid into a host <div>, recreate
// the instance ONLY on a column-shape / theme / header / frozen-count
// change, and route every other prop update through the Grid's imperative
// API. This keeps the running drag-resize / drag-reorder / selection /
// scroll / pending-edit state alive across the kind of unrelated Vue
// re-renders that previously snapped widths back mid-drag.
//
// Callbacks read through the latest options on every dispatch — i.e. the
// hot callback in your <script setup> always sees the freshest closure
// without forcing a Grid recreation. This is the Vue analog of React's
// callback-refs pattern; in Vue we hold the options as a computed and
// dereference it inside the bound function.
// =============================================================================

import {
  computed,
  onScopeDispose,
  ref,
  shallowRef,
  toValue,
  watch,
  type MaybeRefOrGetter,
  type Ref,
  type ShallowRef,
} from 'vue';
import { Grid } from '@onegrid/core';
import type { ColumnDef, GridOptions } from '@onegrid/core';

/** @public */
export type UseOneGridOptions = Omit<GridOptions, 'host'>;

/** @public */
export interface UseOneGridReturn {
  /** Attach to a `<div ref="containerRef">` in the template. */
  readonly containerRef: Ref<HTMLDivElement | null>;
  /** Live Grid instance once mounted. `null` until the host element binds. */
  readonly grid: ShallowRef<Grid | null>;
}

/**
 * Mount a oneGrid instance into a host `<div>`. Accepts either a plain
 * options object, a `Ref` of options, or a getter — the standard
 * `MaybeRefOrGetter` Vue 3 shape. Wrap your options in `reactive()` or
 * pass a getter (`() => ({ columns: cols.value, rowSource })`) so the
 * composable can track property-level changes.
 *
 * The Grid is recreated when:
 *   - the column SHAPE changes (id sequence, count, header text, group),
 *   - `headerHeight`, `frozenColumnCount`, or `theme` changes,
 *   - the container ref binds to a different element.
 *
 * Width-only changes, row-source changes, pinned row-source changes,
 * and callback identity changes all flow through imperative paths
 * (`setColumns`, `setRowSource`, `setPinnedTopRowSource`, etc.) and
 * never trigger a recreate.
 *
 * @public
 */
export function useOneGrid(
  options: MaybeRefOrGetter<UseOneGridOptions>,
): UseOneGridReturn {
  const containerRef = ref<HTMLDivElement | null>(null);
  const grid = shallowRef<Grid | null>(null);

  // Snapshot of the latest options, re-evaluated on every dependency
  // tick. All callbacks below dereference `opts.value.<name>` so the
  // freshest closure fires — no need to re-bind the Grid when only a
  // callback identity changes.
  const opts = computed<UseOneGridOptions>(() => toValue(options));

  // Shape key for the column set. Changes on id-sequence / count
  // / header / group changes; stable across width-only edits. Used
  // to gate Grid recreation vs imperative setColumns().
  const columnsShape = computed(() => deriveColumnsShapeKey(opts.value.columns));

  // Recreate-trigger watcher. Runs after DOM flush so the template
  // <div ref="containerRef"> has bound by the time we read it.
  watch(
    [
      containerRef,
      columnsShape,
      () => opts.value.headerHeight,
      () => opts.value.frozenColumnCount,
      () => opts.value.theme,
    ],
    ([host]) => {
      grid.value?.destroy();
      grid.value = null;
      if (!host) return;
      const o = opts.value;
      if (o.columns.length === 0 || o.rowSource.numRows === 0) return;
      grid.value = new Grid({
        ...o,
        host,
        // Every callback dereferences `opts.value` at call time so the
        // template's latest <script setup> closures fire.
        onFrame: (stats) => opts.value.onFrame?.(stats),
        onSelectionChange: (s) => opts.value.onSelectionChange?.(s),
        onHeaderClick: (id) => opts.value.onHeaderClick?.(id),
        onCellEdit: (row, col, n, oldV) => opts.value.onCellEdit?.(row, col, n, oldV),
        onBeginEdit: (row, col) => opts.value.onBeginEdit?.(row, col),
        onPaste: (row, col, rows) => opts.value.onPaste?.(row, col, rows),
        onToggleExpand: (i) => opts.value.onToggleExpand?.(i),
        getDetailContent: (i) => opts.value.getDetailContent?.(i) ?? null,
        onDetailUnmount: (i, el) => opts.value.onDetailUnmount?.(i, el),
        onFloatingFilterChange: (col, val) =>
          opts.value.onFloatingFilterChange?.(col, val),
        getRowMeta: (row) => opts.value.getRowMeta?.(row) ?? null,
        onToggleGroup: (path) => opts.value.onToggleGroup?.(path),
        onColumnReorder: (from, to, id) =>
          opts.value.onColumnReorder?.(from, to, id),
        onContextMenu: (target) => opts.value.onContextMenu?.(target),
        onFillHandle: (source, fill) => opts.value.onFillHandle?.(source, fill),
      });
    },
    { flush: 'post', immediate: true },
  );

  // Within-shape column edits — width drag echoes, formatter changes,
  // renderer swaps — go through setColumns. We DON'T trigger on
  // identity change (`opts.value.columns` reference flip) because that
  // would race the drag-resize round-trip: a mid-drag width update
  // arrives via onColumnResize, gets stored in Vue state, triggers a
  // re-render, and the stale `columns` reference would snap the Grid
  // back to the previous width — visible as a head-to-toe flicker
  // across header / rows / pinned bands.
  //
  // See the React adapter's matching comment for the original
  // discovery + design rationale.
  watch(columnsShape, () => {
    grid.value?.setColumns(opts.value.columns);
  });

  watch(
    () => [opts.value.rowSource, opts.value.rowHeight] as const,
    () => {
      grid.value?.setRowSource(opts.value.rowSource, opts.value.rowHeight);
    },
  );

  watch(
    () => opts.value.pinnedTopRowSource,
    () => {
      grid.value?.setPinnedTopRowSource(opts.value.pinnedTopRowSource);
    },
  );

  watch(
    () => opts.value.pinnedBottomRowSource,
    () => {
      grid.value?.setPinnedBottomRowSource(opts.value.pinnedBottomRowSource);
    },
  );

  onScopeDispose(() => {
    grid.value?.destroy();
    grid.value = null;
  });

  return { containerRef, grid };
}

function deriveColumnsShapeKey(columns: ReadonlyArray<ColumnDef>): string {
  let s = '';
  for (let i = 0; i < columns.length; i++) {
    if (i > 0) s += '|';
    s += columns[i]?.id ?? '';
  }
  return s;
}
