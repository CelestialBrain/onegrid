import { useEffect, useRef, useState, type RefObject } from 'react';
import { Grid } from '@onegrid/core';
import type { GridOptions } from '@onegrid/core';

export type UseOneGridOptions = Omit<GridOptions, 'host'>;

export interface UseOneGridReturn {
  /** Attach to a `<div>` you render. */
  readonly ref: RefObject<HTMLDivElement | null>;
  /** Live Grid instance once mounted. Null on first render. */
  readonly grid: Grid | null;
}

/**
 * Mount a oneGrid instance into a host `<div>`. The grid is recreated only
 * when columns / headerHeight / frozenColumnCount / theme change. Other
 * props update live via imperative paths:
 *
 *   - `rowSource` / `rowHeight` → `grid.setRowSource(...)` (preserves
 *     scroll, editor focus, floating filter inputs, etc.)
 *   - All callbacks (onFrame, onCellEdit, onPaste, onSelectionChange,
 *     onHeaderClick, onBeginEdit, getDetailContent, onToggleExpand,
 *     onFloatingFilterChange, getRowMeta, onToggleGroup) are stored in
 *     refs and called via stable wrappers. Closure changes propagate
 *     immediately without remounting the Grid — critical when the
 *     callbacks depend on React state that toggles (e.g. group
 *     expansion, master-detail, floating filter values).
 */
export function useOneGrid(options: UseOneGridOptions): UseOneGridReturn {
  const ref = useRef<HTMLDivElement | null>(null);
  const [grid, setGrid] = useState<Grid | null>(null);

  // Refs for every pass-through callback. `current` is reassigned on
  // every render so the latest closure is what fires when the Grid
  // dispatches.
  const onFrameRef = useRef(options.onFrame);
  onFrameRef.current = options.onFrame;
  const onSelectionChangeRef = useRef(options.onSelectionChange);
  onSelectionChangeRef.current = options.onSelectionChange;
  const onHeaderClickRef = useRef(options.onHeaderClick);
  onHeaderClickRef.current = options.onHeaderClick;
  const onCellEditRef = useRef(options.onCellEdit);
  onCellEditRef.current = options.onCellEdit;
  const onBeginEditRef = useRef(options.onBeginEdit);
  onBeginEditRef.current = options.onBeginEdit;
  const onPasteRef = useRef(options.onPaste);
  onPasteRef.current = options.onPaste;
  const onToggleExpandRef = useRef(options.onToggleExpand);
  onToggleExpandRef.current = options.onToggleExpand;
  const getDetailContentRef = useRef(options.getDetailContent);
  getDetailContentRef.current = options.getDetailContent;
  const onDetailUnmountRef = useRef(options.onDetailUnmount);
  onDetailUnmountRef.current = options.onDetailUnmount;
  const onFloatingFilterChangeRef = useRef(options.onFloatingFilterChange);
  onFloatingFilterChangeRef.current = options.onFloatingFilterChange;
  const getRowMetaRef = useRef(options.getRowMeta);
  getRowMetaRef.current = options.getRowMeta;
  const onToggleGroupRef = useRef(options.onToggleGroup);
  onToggleGroupRef.current = options.onToggleGroup;
  const onColumnReorderRef = useRef(options.onColumnReorder);
  onColumnReorderRef.current = options.onColumnReorder;
  const onContextMenuRef = useRef(options.onContextMenu);
  onContextMenuRef.current = options.onContextMenu;

  useEffect(() => {
    if (!ref.current) return;
    if (options.columns.length === 0 || options.rowSource.numRows === 0) return;
    const instance = new Grid({
      ...options,
      host: ref.current,
      onFrame: (stats) => onFrameRef.current?.(stats),
      onSelectionChange: (s) => onSelectionChangeRef.current?.(s),
      onHeaderClick: (id) => onHeaderClickRef.current?.(id),
      onCellEdit: (row, col, n, o) => onCellEditRef.current?.(row, col, n, o),
      onBeginEdit: (row, col) => onBeginEditRef.current?.(row, col),
      onPaste: (row, col, rows) => onPasteRef.current?.(row, col, rows),
      onToggleExpand: (i) => onToggleExpandRef.current?.(i),
      // getDetailContent is read fresh on every chevron click — when
      // null the Grid disables the master-detail layer, so we always
      // pass a wrapper and let the wrapper return null when the React
      // option is undefined.
      getDetailContent: (i) => getDetailContentRef.current?.(i) ?? null,
      onDetailUnmount: (i, el) => onDetailUnmountRef.current?.(i, el),
      onFloatingFilterChange: (col, val) =>
        onFloatingFilterChangeRef.current?.(col, val),
      getRowMeta: (row) => getRowMetaRef.current?.(row) ?? null,
      onToggleGroup: (path) => onToggleGroupRef.current?.(path),
      onColumnReorder: (from, to, id) =>
        onColumnReorderRef.current?.(from, to, id),
      onContextMenu: (target) => onContextMenuRef.current?.(target),
    });
    setGrid(instance);
    return () => {
      instance.destroy();
      setGrid(null);
    };
    // Intentionally NOT depending on rowSource / rowHeight / callbacks
    // — those flow imperatively (setRowSource) or via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    options.columns,
    options.headerHeight,
    options.frozenColumnCount,
    options.theme,
  ]);

  useEffect(() => {
    if (!grid) return;
    grid.setRowSource(options.rowSource, options.rowHeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, options.rowSource, options.rowHeight]);

  return { ref, grid };
}
