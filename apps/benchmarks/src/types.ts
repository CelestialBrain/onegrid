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

declare global {
  interface Window {
    __onegrid?: {
      getMetrics: () => MetricsSnapshot;
      reset: () => void;
      scrollBy: (deltaY: number) => void;
      scrollToRow: (rowIndex: number) => void;
      setRows: (n: number) => void;
    };
  }
}

export {};
