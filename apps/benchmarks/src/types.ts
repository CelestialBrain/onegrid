/**
 * The shape of the metrics snapshot exposed by the playground via
 * `window.__onegrid.getMetrics()`. Mirrors `MetricsSnapshot` from
 * `@onegrid/core` — duplicated here to avoid a circular dependency
 * (benchmarks shouldn't depend on the libraries they test).
 */
export interface MetricsSnapshot {
  windowMs: number;
  frameCount: number;
  fpsAvg: number;
  intervalMsP50: number;
  intervalMsP95: number;
  intervalMsP99: number;
  drawMsP50: number;
  drawMsP95: number;
  drawMsP99: number;
  longFramesGt16: number;
  longFramesGt33: number;
  longFramesGt50: number;
  scrollPxTotal: number;
  cellsPerFrameAvg: number;
  heapUsedBytes?: number;
}

interface SortField {
  readonly columnId: string;
  readonly direction: 'asc' | 'desc';
  readonly nulls?: 'first' | 'last';
}

interface MinimalColumnDef {
  readonly id: string;
  readonly width: number;
}

declare global {
  interface Window {
    __onegrid?: {
      getMetrics: () => MetricsSnapshot;
      reset: () => void;
      scrollBy: (deltaY: number) => void;
      scrollToRow: (rowIndex: number) => void;
      setRows: (n: number) => void;
      setSort: (sort: ReadonlyArray<SortField>) => void;
      getSort: () => ReadonlyArray<SortField>;
      setFilter: (query: string) => void;
      getFilter: () => string;
      /** v1.2 — current column layout for resize / reorder tests. */
      getColumns?: () => ReadonlyArray<MinimalColumnDef>;
      /** Logical scroll + visible-row state — for scroll-virtualization
       *  specs that need to assert on row indices reachable at the
       *  physical bottom of the scrollbar. */
      getViewportInfo?: () => {
        readonly scrollTop: number;
        readonly scrollLeft: number;
        readonly scrollScale: number;
        readonly totalHeight: number;
        readonly numRows: number;
        readonly viewportWidth: number;
        readonly viewportHeight: number;
        readonly firstVisibleRow: number;
        readonly lastVisibleRow: number;
      };
      setMode?: (m: string) => void;
      getMode?: () => string;
      undo?: () => void;
      redo?: () => void;
      undoState?: () =>
        | {
            readonly canUndo: boolean;
            readonly canRedo: boolean;
            readonly undoCount: number;
            readonly redoCount: number;
          }
        | undefined;
      auditQuery?: (sourceRow: number) => Promise<
        ReadonlyArray<{
          readonly ts: number;
          readonly event: string;
          readonly columnId: string;
          readonly oldValue: string;
          readonly newValue: string;
        }>
      >;
      auditAppend?: (
        sourceRow: number,
        ts: number,
        event: 'edit' | 'paste' | 'fill' | 'undo' | 'redo',
        columnId: string,
        oldValue: string,
        newValue: string,
      ) => void;
      auditClear?: () => void;
      writeCell?: (visualRow: number, columnId: string, newValue: string) => boolean;
      readCell?: (visualRow: number, columnId: string) => unknown;
      /** The mounted host element. Read for boundingClientRect-based
       *  coordinate math in real-Chromium specs. */
      host?: HTMLElement;
    };
  }
}

export {};
