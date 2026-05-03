// =============================================================================
// Core types for @onegrid/core.
// =============================================================================

import type { SelectionSnapshot } from './selection';

/**
 * Per-column configuration. Width is the only required visual property; the
 * rest is callbacks the renderer invokes per cell.
 */
export interface ColumnDef<TValue = unknown> {
  readonly id: string;
  readonly width: number;
  readonly displayName?: string;
  readonly minWidth?: number;
  readonly maxWidth?: number;
  readonly pinned?: 'left' | 'right';
  /** Formatter the renderer invokes to convert a cell value to display text. */
  readonly format?: (value: TValue, rowIndex: number) => string;
  /** Optional per-cell foreground color. */
  readonly color?: (value: TValue, rowIndex: number) => string | undefined;
  /** Optional per-cell background color. */
  readonly background?: (value: TValue, rowIndex: number) => string | undefined;
}

/**
 * Synchronous random-access row reader. The renderer calls `getCell` once per
 * visible cell per frame; allocations and async operations on this hot path
 * will tank FPS. RowSources backed by remote data (SSRM) cache blocks ahead
 * of time and serve cell reads from local typed arrays.
 */
export interface RowSource {
  readonly numRows: number;
  readonly getCell: (rowIndex: number, columnId: string) => unknown;
}

/**
 * Per-frame statistics emitted via `onFrame`. Same shape exposed in the
 * playground's live meter.
 */
export interface FrameStats {
  readonly fps: number;
  readonly visibleRowStart: number;
  readonly visibleRowEnd: number;
  readonly drawCellsPerFrame: number;
  readonly drawDurationMs: number;
}

/**
 * Aggregate metrics for a benchmark scenario.
 */
export interface MetricsSnapshot {
  readonly windowMs: number;
  readonly frameCount: number;
  readonly fpsAvg: number;
  readonly intervalMsP50: number;
  readonly intervalMsP95: number;
  readonly intervalMsP99: number;
  readonly drawMsP50: number;
  readonly drawMsP95: number;
  readonly drawMsP99: number;
  readonly longFramesGt16: number;
  readonly longFramesGt33: number;
  readonly longFramesGt50: number;
  readonly scrollPxTotal: number;
  readonly cellsPerFrameAvg: number;
  readonly heapUsedBytes?: number;
}

/** Theme tokens consumed by the canvas renderer. */
export interface GridTheme {
  readonly background: string;
  readonly altRowBackground: string;
  readonly headerBackground: string;
  readonly text: string;
  readonly mutedText: string;
  readonly border: string;
  readonly fontFamily: string;
  readonly fontSize: number;
}

export const DEFAULT_THEME: GridTheme = {
  background: '#0b0d10',
  altRowBackground: '#11141a',
  headerBackground: '#1b1f26',
  text: '#e7e9ec',
  mutedText: '#8b929c',
  border: '#1c2027',
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
  fontSize: 13,
};

export interface GridOptions {
  /** DOM element to mount into. */
  readonly host: HTMLElement;
  /** Column definitions, left-to-right in display order. */
  readonly columns: ReadonlyArray<ColumnDef>;
  /** Synchronous row reader. */
  readonly rowSource: RowSource;
  /** Per-row heights. If a single number, applied uniformly. */
  readonly rowHeight: number | Float32Array;
  /** Header band height in CSS pixels. Default 32. */
  readonly headerHeight?: number;
  /** Number of left-pinned columns. Default 0. */
  readonly frozenColumnCount?: number;
  /** Theme tokens. Defaults to a dark palette. */
  readonly theme?: Partial<GridTheme>;
  /** Per-frame callback for live FPS meters. */
  readonly onFrame?: (stats: FrameStats) => void;
  /** Fires whenever the selection changes (click, drag, keyboard, programmatic). */
  readonly onSelectionChange?: (selection: SelectionSnapshot) => void;
}
