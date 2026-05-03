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
 * Mount a oneGrid instance into a host `<div>`. The grid is recreated when
 * the column list, row source, row height, or theme identity changes — keep
 * these stable (e.g. via useMemo) for live grids.
 *
 * `onFrame` is captured into a ref so callback identity changes don't
 * remount the grid.
 */
export function useOneGrid(options: UseOneGridOptions): UseOneGridReturn {
  const ref = useRef<HTMLDivElement | null>(null);
  const [grid, setGrid] = useState<Grid | null>(null);

  const onFrameRef = useRef<UseOneGridOptions['onFrame']>(options.onFrame);
  onFrameRef.current = options.onFrame;

  useEffect(() => {
    if (!ref.current) return;
    // Don't mount until we have real data. Lets consumers render a
    // "connecting…" placeholder while async data sources resolve.
    if (options.columns.length === 0 || options.rowSource.numRows === 0) return;
    const instance = new Grid({
      ...options,
      host: ref.current,
      onFrame: (stats) => {
        onFrameRef.current?.(stats);
      },
    });
    setGrid(instance);
    return () => {
      instance.destroy();
      setGrid(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    options.columns,
    options.rowSource,
    options.rowHeight,
    options.headerHeight,
    options.frozenColumnCount,
    options.theme,
  ]);

  return { ref, grid };
}
