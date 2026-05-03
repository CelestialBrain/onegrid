// =============================================================================
// Grid — oneGrid's Canvas-2D renderer + DOM accessibility shadow.
//
// Architecture:
//   - <canvas> for pixels.
//   - A native scrollbar over a tall transparent <div> for native scroll feel.
//   - A FenwickHeights tree for O(log n) offsetForRow / rowAtOffset.
//   - A hidden <table role="grid"> mirror of the visible viewport ± buffer
//     so screen readers (NVDA, VoiceOver, JAWS) get a real ARIA grid to
//     traverse, with `aria-rowindex` / `aria-colindex` carrying the *true*
//     virtual row position even though only a window of cells is in the DOM.
//   - DPR-aware drawing for crisp text on retina.
//   - Velocity-aware overscan to avoid blank frames during fast flings.
//
// No framework dependency. The host is any HTMLElement.
// =============================================================================

import { FenwickHeights } from '@onegrid/data';
import {
  DEFAULT_THEME,
  type ColumnDef,
  type FrameStats,
  type GridOptions,
  type GridTheme,
  type MetricsSnapshot,
  type RowSource,
} from './types';
import { SelectionModel, type CellPosition, type SelectionSnapshot } from './selection';
import type { SortModel } from '@onegrid/protocol';

interface FrameSample {
  ts: number;
  drawDurationMs: number;
  scrollDelta: number;
  cells: number;
}

interface PerformanceWithMemory extends Performance {
  readonly memory?: {
    readonly usedJSHeapSize: number;
  };
}

export class Grid {
  private readonly host: HTMLElement;
  private readonly columns: ReadonlyArray<ColumnDef>;
  private rowSource: RowSource;
  private fenwick: FenwickHeights;
  private readonly headerHeight: number;
  private readonly frozenColumnCount: number;
  private readonly theme: GridTheme;
  private readonly onFrame: ((stats: FrameStats) => void) | undefined;

  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly scrollHost: HTMLDivElement;
  private readonly scrollSpacer: HTMLDivElement;
  private readonly a11yMount: HTMLDivElement;
  private readonly resizeObserver: ResizeObserver;

  private dpr: number;
  private viewportWidth = 0;
  private viewportHeight = 0;
  private scrollTop = 0;
  private scrollLeft = 0;
  private lastRenderedScrollTop = -1;
  private lastRenderedScrollLeft = -1;

  private rafHandle: number | null = null;
  private needsRender = true;
  private destroyed = false;

  private readonly frameBufferCap = 4096;
  private readonly frameBuffer: FrameSample[] = [];
  private frameBufferHead = 0;
  private velocity = 0;
  private debugLog = false;

  private cumulativeColumnWidths: Float32Array;
  private totalColumnsWidth = 0;
  private frozenWidth = 0;

  private readonly selection = new SelectionModel();
  private readonly onSelectionChange: ((s: SelectionSnapshot) => void) | undefined;
  private readonly onHeaderClick: ((columnId: string) => void) | undefined;
  private sort: SortModel = [];
  private isPointerDragging = false;
  private suppressSelectionUntilUp = false;

  // Master-detail (expandable rows) state.
  private baseHeights: Float32Array;
  private expanded: Set<number> = new Set();
  private readonly detailHeight: number;
  private readonly getDetailContent: ((rowIndex: number) => HTMLElement | null) | undefined;
  private readonly onToggleExpand: ((rowIndex: number) => void) | undefined;
  private detailLayer: HTMLDivElement | null = null;
  private mountedDetails = new Map<number, HTMLDivElement>();
  private readonly chevronWidth = 24;

  constructor(options: GridOptions) {
    this.host = options.host;
    this.columns = options.columns;
    this.rowSource = options.rowSource;
    this.headerHeight = options.headerHeight ?? 32;
    this.frozenColumnCount = options.frozenColumnCount ?? 0;
    this.theme = { ...DEFAULT_THEME, ...options.theme };
    this.onFrame = options.onFrame;
    this.onSelectionChange = options.onSelectionChange;
    this.onHeaderClick = options.onHeaderClick;
    this.sort = options.sort ?? [];

    this.dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;

    // Master-detail wiring: track BASE row heights separately so we can
    // compose effective heights = base + (expanded ? detailHeight : 0)
    // when the user toggles row expansion.
    this.detailHeight = options.detailHeight ?? 200;
    this.getDetailContent = options.getDetailContent;
    this.onToggleExpand = options.onToggleExpand;
    if (options.expanded) {
      this.expanded = new Set(options.expanded);
    }
    this.baseHeights =
      typeof options.rowHeight === 'number'
        ? new Float32Array(options.rowSource.numRows).fill(options.rowHeight)
        : new Float32Array(options.rowHeight); // copy so the user's array isn't mutated
    this.fenwick = new FenwickHeights(this.computeEffectiveHeights());

    // The host needs to be a positioning context for our absolute children.
    // Only force `position: relative` if it's currently `static` — otherwise
    // we'd clobber a caller's deliberate `position: absolute / fixed`, which
    // would collapse the host to 0 height because relative positioning
    // requires an explicit dimension to size against.
    if (getComputedStyle(this.host).position === 'static') {
      this.host.style.position = 'relative';
    }
    // We do NOT clear the host — React (or any framework) may own children
    // there. The Grid only manages elements it appended itself, removed in
    // destroy() via Element.remove().

    this.canvas = document.createElement('canvas');
    this.canvas.style.position = 'absolute';
    this.canvas.style.inset = '0';
    this.canvas.style.pointerEvents = 'none';
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Grid: 2D context unavailable.');
    this.ctx = ctx;

    this.scrollHost = document.createElement('div');
    this.scrollHost.style.position = 'absolute';
    this.scrollHost.style.inset = '0';
    this.scrollHost.style.overflow = 'auto';
    this.scrollHost.style.outline = 'none';
    this.scrollHost.tabIndex = 0;
    this.scrollHost.setAttribute('role', 'grid');
    this.scrollHost.setAttribute('aria-rowcount', String(this.rowSource.numRows));
    this.scrollHost.setAttribute('aria-colcount', String(this.columns.length));

    this.scrollSpacer = document.createElement('div');
    this.scrollSpacer.style.position = 'relative';
    this.scrollHost.appendChild(this.scrollSpacer);

    this.a11yMount = document.createElement('div');
    this.a11yMount.style.cssText =
      'position:absolute;left:-100000px;top:-100000px;width:1px;height:1px;overflow:hidden;';
    this.a11yMount.setAttribute('aria-hidden', 'false');

    this.host.appendChild(this.canvas);
    this.host.appendChild(this.scrollHost);
    this.host.appendChild(this.a11yMount);

    // Master-detail layer: only created when getDetailContent is provided.
    // Sits above the canvas but inherits pointer-events from each panel
    // child (so detail UIs can be interactive without intercepting grid
    // scrolling).
    if (this.getDetailContent) {
      this.detailLayer = document.createElement('div');
      this.detailLayer.style.cssText =
        'position:absolute;inset:0;pointer-events:none;overflow:hidden;';
      this.host.appendChild(this.detailLayer);
    }

    this.cumulativeColumnWidths = new Float32Array(this.columns.length + 1);
    this.recomputeColumnLayout();

    this.resizeObserver = new ResizeObserver(() => {
      this.handleResize();
    });
    this.resizeObserver.observe(this.host);
    this.scrollHost.addEventListener('scroll', this.handleScroll, { passive: true });
    this.scrollHost.addEventListener('pointerdown', this.handlePointerDown);
    this.scrollHost.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('keydown', this.handleKeyDown);

    this.handleResize();
    this.scheduleRender();

    try {
      this.debugLog = new URLSearchParams(window.location.search).get('debug') === '1';
    } catch {
      this.debugLog = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Public imperative API
  // ---------------------------------------------------------------------------

  setRowSource(rowSource: RowSource, rowHeight: number | Float32Array): void {
    this.rowSource = rowSource;
    this.fenwick = new FenwickHeights(
      typeof rowHeight === 'number'
        ? new Float32Array(rowSource.numRows).fill(rowHeight)
        : rowHeight,
    );
    this.scrollHost.setAttribute('aria-rowcount', String(rowSource.numRows));
    this.scrollTop = 0;
    this.scrollLeft = 0;
    this.scrollHost.scrollTo(0, 0);
    this.lastRenderedScrollTop = -1;
    this.lastRenderedScrollLeft = -1;
    this.recomputeColumnLayout();
    this.scheduleRender();
  }

  scrollBy(deltaY: number): void {
    this.scrollHost.scrollBy({ top: deltaY });
  }

  scrollToRow(rowIndex: number): void {
    const clamped = Math.max(0, Math.min(rowIndex, this.rowSource.numRows - 1));
    this.scrollHost.scrollTo({ top: this.fenwick.prefixSum(clamped) });
  }

  getMetricsSnapshot(): MetricsSnapshot {
    const frames = this.framesInOrder();
    const frameCount = frames.length;
    if (frameCount === 0) return EMPTY_SNAPSHOT;
    const first = frames[0]!;
    const last = frames[frameCount - 1]!;
    const windowMs = last.ts - first.ts;

    const intervals: number[] = [];
    let scrollPxTotal = 0;
    let cellsTotal = 0;
    let long16 = 0;
    let long33 = 0;
    let long50 = 0;
    for (let i = 1; i < frameCount; i++) {
      const cur = frames[i]!;
      const prev = frames[i - 1]!;
      const dt = cur.ts - prev.ts;
      intervals.push(dt);
      if (dt > 16.7) long16++;
      if (dt > 33.4) long33++;
      if (dt > 50) long50++;
      scrollPxTotal += cur.scrollDelta;
      cellsTotal += cur.cells;
    }
    cellsTotal += first.cells;

    const draws = frames.map((f) => f.drawDurationMs);
    const fpsAvg =
      windowMs > 0 ? Math.round(((frameCount - 1) / windowMs) * 1000 * 10) / 10 : 0;

    const heap =
      typeof performance !== 'undefined' && (performance as PerformanceWithMemory).memory
        ? (performance as PerformanceWithMemory).memory!.usedJSHeapSize
        : undefined;

    return {
      windowMs: Math.round(windowMs),
      frameCount,
      fpsAvg,
      intervalMsP50: percentile(intervals, 0.5),
      intervalMsP95: percentile(intervals, 0.95),
      intervalMsP99: percentile(intervals, 0.99),
      drawMsP50: percentile(draws, 0.5),
      drawMsP95: percentile(draws, 0.95),
      drawMsP99: percentile(draws, 0.99),
      longFramesGt16: long16,
      longFramesGt33: long33,
      longFramesGt50: long50,
      scrollPxTotal: Math.round(scrollPxTotal),
      cellsPerFrameAvg: Math.round(cellsTotal / frameCount),
      ...(heap !== undefined ? { heapUsedBytes: heap } : {}),
    };
  }

  resetMetrics(): void {
    this.frameBuffer.length = 0;
    this.frameBufferHead = 0;
  }

  /** Force a redraw on the next animation frame. */
  refresh(): void {
    this.lastRenderedScrollTop = -1;
    this.scheduleRender();
  }

  /** Replace the current sort and redraw header indicators. Caller is
   *  responsible for re-fetching / re-sorting the underlying data. */
  setSort(sort: SortModel): void {
    this.sort = sort;
    this.refresh();
  }

  // ---------------------------------------------------------------------------
  // Master-detail (expandable rows) — public API
  // ---------------------------------------------------------------------------

  /** Replace the expanded set. Triggers a layout pass + redraw so heights
   *  update and detail panels mount/unmount as needed. */
  setExpanded(expanded: ReadonlySet<number> | ReadonlyArray<number>): void {
    this.expanded = new Set(expanded);
    this.rebuildHeightsFromExpansion();
    this.handleResize();
    this.refresh();
  }

  /** Toggle a single row's expansion. */
  toggleExpanded(rowIndex: number): void {
    if (this.expanded.has(rowIndex)) {
      this.expanded.delete(rowIndex);
    } else {
      this.expanded.add(rowIndex);
    }
    this.onToggleExpand?.(rowIndex);
    this.rebuildHeightsFromExpansion();
    this.handleResize();
    this.refresh();
  }

  isExpanded(rowIndex: number): boolean {
    return this.expanded.has(rowIndex);
  }

  destroy(): void {
    this.destroyed = true;
    if (this.rafHandle !== null) cancelAnimationFrame(this.rafHandle);
    this.resizeObserver.disconnect();
    this.scrollHost.removeEventListener('scroll', this.handleScroll);
    this.scrollHost.removeEventListener('pointerdown', this.handlePointerDown);
    this.scrollHost.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('keydown', this.handleKeyDown);
    // Only remove the elements we appended — leave any framework-owned
    // siblings alone.
    this.canvas.remove();
    this.scrollHost.remove();
    this.a11yMount.remove();
    this.detailLayer?.remove();
    this.mountedDetails.clear();
  }

  /** Combine baseHeights + detailHeight per expanded row into the array
   *  the FenwickHeights tree consumes. Cheap: ~1 alloc + O(rows) iteration.
   *  Called on expansion changes. */
  private computeEffectiveHeights(): Float32Array {
    if (this.expanded.size === 0) return this.baseHeights;
    const out = new Float32Array(this.baseHeights.length);
    for (let i = 0; i < this.baseHeights.length; i++) {
      out[i] = (this.baseHeights[i] ?? 0) + (this.expanded.has(i) ? this.detailHeight : 0);
    }
    return out;
  }

  private rebuildHeightsFromExpansion(): void {
    this.fenwick = new FenwickHeights(this.computeEffectiveHeights());
  }

  // ---------------------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------------------

  getSelection(): SelectionSnapshot {
    return this.selection.snapshot();
  }

  selectCell(pos: CellPosition): void {
    this.selection.selectCell(pos);
    this.notifySelectionChange();
    this.scheduleRender();
  }

  clearSelection(): void {
    this.selection.clear();
    this.notifySelectionChange();
    this.scheduleRender();
  }

  selectAll(): void {
    this.selection.selectAll(this.rowSource.numRows, this.columns.length);
    this.notifySelectionChange();
    this.scheduleRender();
  }

  /**
   * Serialize the current selection as TSV (Excel/Sheets-compatible) and
   * write it to the system clipboard. Returns the TSV string for testability.
   */
  async copySelectionToClipboard(): Promise<string> {
    const tsv = this.selection.toTsv((row, col) => {
      const column = this.columns[col];
      if (!column) return '';
      const value = this.rowSource.getCell(row, column.id);
      return column.format ? column.format(value, row) : String(value ?? '');
    });
    if (tsv && typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(tsv);
      } catch {
        // Clipboard write can fail in non-secure contexts; the caller still
        // gets the string back and can use a custom fallback.
      }
    }
    return tsv;
  }

  private notifySelectionChange(): void {
    this.onSelectionChange?.(this.selection.snapshot());
  }

  // ---------------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------------

  private recomputeColumnLayout(): void {
    this.cumulativeColumnWidths = new Float32Array(this.columns.length + 1);
    let acc = 0;
    for (let i = 0; i < this.columns.length; i++) {
      acc += this.columns[i]?.width ?? 0;
      this.cumulativeColumnWidths[i + 1] = acc;
    }
    this.totalColumnsWidth = acc;
    let frozen = 0;
    for (let i = 0; i < this.frozenColumnCount; i++) {
      frozen += this.columns[i]?.width ?? 0;
    }
    this.frozenWidth = frozen;
  }

  private handleResize = (): void => {
    const rect = this.host.getBoundingClientRect();
    this.dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    this.viewportWidth = Math.max(0, Math.floor(rect.width));
    this.viewportHeight = Math.max(0, Math.floor(rect.height));
    this.canvas.width = Math.floor(this.viewportWidth * this.dpr);
    this.canvas.height = Math.floor(this.viewportHeight * this.dpr);
    this.canvas.style.width = `${this.viewportWidth}px`;
    this.canvas.style.height = `${this.viewportHeight}px`;
    this.scrollSpacer.style.width = `${this.totalColumnsWidth}px`;
    this.scrollSpacer.style.height = `${this.headerHeight + this.fenwick.totalHeight}px`;
    this.lastRenderedScrollTop = -1;
    this.scheduleRender();
  };

  private handleScroll = (): void => {
    const newTop = this.scrollHost.scrollTop;
    const newLeft = this.scrollHost.scrollLeft;
    this.velocity = Math.abs(newTop - this.scrollTop);
    this.scrollTop = newTop;
    this.scrollLeft = newLeft;
    this.scheduleRender();
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (document.activeElement !== this.scrollHost) return;

    // Ctrl/Cmd + C → copy selection as TSV.
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
      void this.copySelectionToClipboard();
      e.preventDefault();
      return;
    }
    // Ctrl/Cmd + A → select all.
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
      this.selectAll();
      e.preventDefault();
      return;
    }

    // Selection-aware arrow keys: extend with shift, replace without.
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const dr = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
      const dc = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (e.shiftKey && !this.selection.isEmpty()) {
        this.selection.extendActiveBy(dr, dc, this.rowSource.numRows, this.columns.length);
      } else {
        this.selection.moveActive(dr, dc, this.rowSource.numRows, this.columns.length);
      }
      this.notifySelectionChange();
      this.scrollActiveIntoView();
      this.scheduleRender();
      e.preventDefault();
      return;
    }

    // Fallback: scroll-only nav.
    const pageStep = Math.max(1, Math.floor(this.viewportHeight / 24));
    let delta = 0;
    if (e.key === 'PageDown') delta = pageStep * 24;
    else if (e.key === 'PageUp') delta = -pageStep * 24;
    else if (e.key === 'Home') {
      this.scrollHost.scrollTo({ top: 0 });
      e.preventDefault();
      return;
    } else if (e.key === 'End') {
      this.scrollHost.scrollTo({ top: this.fenwick.totalHeight });
      e.preventDefault();
      return;
    } else return;
    this.scrollHost.scrollBy({ top: delta });
    e.preventDefault();
  };

  // ---------------------------------------------------------------------------
  // Pointer events → selection
  // ---------------------------------------------------------------------------

  private handlePointerDown = (e: PointerEvent): void => {
    const rect = this.host.getBoundingClientRect();
    const localY = e.clientY - rect.top;
    const localX = e.clientX - rect.left;

    // Header click? Dispatch onHeaderClick instead of starting selection.
    if (localY >= 0 && localY < this.headerHeight && this.onHeaderClick) {
      const col = this.columnAtLocalX(localX);
      if (col !== null) {
        const column = this.columns[col];
        if (column) {
          this.onHeaderClick(column.id);
          this.suppressSelectionUntilUp = true;
        }
      }
      return;
    }

    // Master-detail chevron click: leftmost `chevronWidth` pixels of any
    // row toggle that row's expansion. Higher priority than cell selection.
    if (
      this.getDetailContent &&
      localY >= this.headerHeight &&
      localX >= 0 &&
      localX < this.chevronWidth
    ) {
      const yInLayout = localY - this.headerHeight + this.scrollTop;
      if (yInLayout >= 0) {
        const row = this.fenwick.indexAtOffset(yInLayout);
        if (row >= 0 && row < this.rowSource.numRows) {
          this.toggleExpanded(row);
          this.suppressSelectionUntilUp = true;
          return;
        }
      }
    }

    const cell = this.cellAtClient(e.clientX, e.clientY);
    if (!cell) return;
    if (e.shiftKey && !this.selection.isEmpty()) {
      this.selection.extendActiveRange(cell);
    } else if (e.metaKey || e.ctrlKey) {
      this.selection.addRange(cell);
    } else {
      this.selection.startRange(cell);
    }
    this.isPointerDragging = true;
    try {
      this.scrollHost.setPointerCapture(e.pointerId);
    } catch {
      // setPointerCapture can throw if the element doesn't have it; harmless.
    }
    this.notifySelectionChange();
    this.scheduleRender();
  };

  private columnAtLocalX(localX: number): number | null {
    if (localX < 0) return null;
    if (localX < this.frozenWidth) {
      return colAtX(this.cumulativeColumnWidths, localX, 0, this.frozenColumnCount);
    }
    if (localX > this.viewportWidth) return null;
    const xInLayout =
      localX -
      this.frozenWidth +
      this.scrollLeft +
      (this.cumulativeColumnWidths[this.frozenColumnCount] ?? 0);
    return colAtX(
      this.cumulativeColumnWidths,
      xInLayout,
      this.frozenColumnCount,
      this.columns.length,
    );
  }

  private handlePointerMove = (e: PointerEvent): void => {
    if (!this.isPointerDragging) return;
    const cell = this.cellAtClient(e.clientX, e.clientY);
    if (!cell) return;
    this.selection.extendActiveRange(cell);
    this.notifySelectionChange();
    this.scheduleRender();
  };

  private handlePointerUp = (): void => {
    this.isPointerDragging = false;
    this.suppressSelectionUntilUp = false;
  };

  private cellAtClient(clientX: number, clientY: number): CellPosition | null {
    const rect = this.host.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    if (localY < this.headerHeight) return null;
    if (localX < 0 || localY < 0) return null;
    if (localX > this.viewportWidth || localY > this.viewportHeight) return null;

    const yInLayout = localY - this.headerHeight + this.scrollTop;
    if (yInLayout < 0) return null;
    const row = this.fenwick.indexAtOffset(yInLayout);
    if (row < 0 || row >= this.rowSource.numRows) return null;

    let col: number;
    if (localX < this.frozenWidth) {
      // Frozen band: column index lies in [0, frozenColumnCount).
      col = colAtX(this.cumulativeColumnWidths, localX, 0, this.frozenColumnCount);
    } else {
      // Scrolling band: subtract frozen offset, add scrollLeft.
      const xInLayout =
        localX -
        this.frozenWidth +
        this.scrollLeft +
        (this.cumulativeColumnWidths[this.frozenColumnCount] ?? 0);
      col = colAtX(
        this.cumulativeColumnWidths,
        xInLayout,
        this.frozenColumnCount,
        this.columns.length,
      );
    }
    if (col < 0) return null;
    return { row, col };
  }

  private scrollActiveIntoView(): void {
    const active = this.selection.active;
    if (!active) return;
    const top = this.fenwick.prefixSum(active.row);
    const bottom = top + this.fenwick.get(active.row);
    const viewportTop = this.scrollTop;
    const viewportBottom = this.scrollTop + this.viewportHeight - this.headerHeight;
    if (top < viewportTop) {
      this.scrollHost.scrollTo({ top });
    } else if (bottom > viewportBottom) {
      this.scrollHost.scrollTo({ top: bottom - (this.viewportHeight - this.headerHeight) });
    }
  }

  // ---------------------------------------------------------------------------
  // Render loop
  // ---------------------------------------------------------------------------

  private scheduleRender(): void {
    this.needsRender = true;
    if (this.rafHandle === null && !this.destroyed) {
      this.rafHandle = requestAnimationFrame(this.tick);
    }
  }

  private tick = (ts: number): void => {
    this.rafHandle = null;
    if (this.destroyed) return;
    const scrollDelta = Math.abs(this.scrollTop - this.lastRenderedScrollTop);
    if (
      this.needsRender ||
      this.scrollTop !== this.lastRenderedScrollTop ||
      this.scrollLeft !== this.lastRenderedScrollLeft
    ) {
      const t0 = performance.now();
      const stats = this.render();
      const t1 = performance.now();
      this.recordFrame(ts, t1 - t0, scrollDelta, stats.drawCellsPerFrame);
      this.onFrame?.({
        ...stats,
        drawDurationMs: t1 - t0,
        fps: this.computeRollingFps(),
      });
      this.lastRenderedScrollTop = this.scrollTop;
      this.lastRenderedScrollLeft = this.scrollLeft;
      this.needsRender = false;
    }
    if (!this.destroyed) {
      this.rafHandle = requestAnimationFrame(this.tick);
    }
  };

  private recordFrame(
    ts: number,
    drawDurationMs: number,
    scrollDelta: number,
    cells: number,
  ): void {
    const sample: FrameSample = { ts, drawDurationMs, scrollDelta, cells };
    if (this.frameBuffer.length < this.frameBufferCap) {
      this.frameBuffer.push(sample);
    } else {
      this.frameBuffer[this.frameBufferHead] = sample;
      this.frameBufferHead = (this.frameBufferHead + 1) % this.frameBufferCap;
    }
    if (this.debugLog && drawDurationMs > 16) {
      console.warn(
        `[onegrid] long frame ${drawDurationMs.toFixed(1)}ms (cells=${String(cells)}, dy=${scrollDelta.toFixed(0)}px)`,
      );
    }
  }

  private framesInOrder(): FrameSample[] {
    if (this.frameBuffer.length < this.frameBufferCap) return this.frameBuffer.slice();
    return [
      ...this.frameBuffer.slice(this.frameBufferHead),
      ...this.frameBuffer.slice(0, this.frameBufferHead),
    ];
  }

  private computeRollingFps(): number {
    const frames = this.framesInOrder();
    if (frames.length < 2) return 0;
    const cutoff = (frames[frames.length - 1]?.ts ?? 0) - 1000;
    let i = frames.length - 1;
    while (i > 0 && (frames[i - 1]?.ts ?? 0) >= cutoff) i--;
    const window = frames.slice(i);
    if (window.length < 2) return 0;
    const first = window[0];
    const last = window[window.length - 1];
    if (!first || !last) return 0;
    const elapsed = last.ts - first.ts;
    if (elapsed <= 0) return 0;
    return Math.round((window.length - 1) / (elapsed / 1000));
  }

  // ---------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------

  private render(): Omit<FrameStats, 'fps' | 'drawDurationMs'> {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.viewportWidth, this.viewportHeight);

    const overscan = this.velocityAwareOverscan();
    const start = Math.max(0, this.fenwick.indexAtOffset(this.scrollTop) - overscan);
    const endOffset = this.scrollTop + this.viewportHeight - this.headerHeight;
    const end = Math.min(
      this.rowSource.numRows - 1,
      this.fenwick.indexAtOffset(endOffset) + overscan,
    );

    const firstRowTop = this.fenwick.prefixSum(start);
    let drawnCells = 0;

    // Scrolling band — non-frozen columns.
    ctx.save();
    ctx.beginPath();
    ctx.rect(
      this.frozenWidth,
      this.headerHeight,
      this.viewportWidth - this.frozenWidth,
      this.viewportHeight - this.headerHeight,
    );
    ctx.clip();
    drawnCells += this.drawRows(
      start,
      end,
      firstRowTop,
      this.frozenColumnCount,
      this.columns.length,
      this.scrollLeft,
    );
    ctx.restore();

    // Frozen columns (always on top of scrolling band).
    if (this.frozenColumnCount > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(
        0,
        this.headerHeight,
        this.frozenWidth,
        this.viewportHeight - this.headerHeight,
      );
      ctx.clip();
      drawnCells += this.drawRows(start, end, firstRowTop, 0, this.frozenColumnCount, 0);
      ctx.restore();
    }

    this.drawSelectionOverlay(start, end);
    if (this.getDetailContent) {
      this.drawChevrons(start, end, firstRowTop);
      this.syncDetailLayer(start, end, firstRowTop);
    }
    this.drawHeader();
    this.updateAccessibilityShadow(start, end);

    return {
      visibleRowStart: start,
      visibleRowEnd: end,
      drawCellsPerFrame: drawnCells,
    };
  }

  /** Paint a small ▶/▼ chevron at the leftmost edge of every visible row.
   *  Click detection lives in handlePointerDown; this is purely visual.
   *  Drawn after rows but before the header so it doesn't bleed into the
   *  header band on scroll. */
  private drawChevrons(start: number, end: number, firstRowTop: number): void {
    const ctx = this.ctx;
    let y = this.headerHeight + (firstRowTop - this.scrollTop);
    ctx.font = `${String(this.theme.fontSize)}px ${this.theme.fontFamily}`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = this.theme.mutedText;
    for (let row = start; row <= end; row++) {
      const baseH = this.baseHeights[row] ?? 0;
      const expanded = this.expanded.has(row);
      const glyph = expanded ? '\u25BC' : '\u25B6'; // ▼ / ▶
      // Center the chevron vertically in the row's BASE band (not over
      // the detail panel area).
      ctx.fillText(glyph, 8, y + baseH / 2 + 1);
      y += baseH + (expanded ? this.detailHeight : 0);
    }
  }

  /** Mount / position / unmount detail panel divs based on which expanded
   *  rows fall in the visible viewport. Reuses cached panel elements so
   *  the user's content survives scroll without re-render. */
  private syncDetailLayer(start: number, end: number, firstRowTop: number): void {
    if (!this.detailLayer || !this.getDetailContent) return;
    const visibleExpanded = new Set<number>();
    let y = this.headerHeight + (firstRowTop - this.scrollTop);
    for (let row = start; row <= end; row++) {
      const baseH = this.baseHeights[row] ?? 0;
      if (this.expanded.has(row)) {
        visibleExpanded.add(row);
        let panel = this.mountedDetails.get(row);
        if (!panel) {
          const content = this.getDetailContent(row);
          if (content) {
            panel = document.createElement('div');
            panel.style.cssText =
              'position:absolute;left:0;right:0;pointer-events:auto;overflow:hidden;';
            panel.appendChild(content);
            this.detailLayer.appendChild(panel);
            this.mountedDetails.set(row, panel);
          }
        }
        if (panel) {
          panel.style.top = `${String(y + baseH)}px`;
          panel.style.height = `${String(this.detailHeight)}px`;
        }
      }
      y += baseH + (this.expanded.has(row) ? this.detailHeight : 0);
    }
    // Garbage-collect panels for rows that are no longer in view OR no
    // longer expanded.
    for (const [row, panel] of this.mountedDetails) {
      if (!visibleExpanded.has(row)) {
        panel.remove();
        this.mountedDetails.delete(row);
      }
    }
  }

  private drawSelectionOverlay(start: number, end: number): void {
    if (this.selection.isEmpty()) return;
    const ctx = this.ctx;
    const ranges = this.selection.normalizedRanges();
    const active = this.selection.active;

    for (const range of ranges) {
      if (range.rowEnd < start || range.rowStart > end) continue;
      const rowFrom = Math.max(range.rowStart, start);
      const rowTo = Math.min(range.rowEnd, end);
      const yTop =
        this.headerHeight + (this.fenwick.prefixSum(rowFrom) - this.scrollTop);
      let h = 0;
      for (let r = rowFrom; r <= rowTo; r++) h += this.fenwick.get(r);

      const colFrom = Math.max(range.colStart, 0);
      const colTo = Math.min(range.colEnd, this.columns.length - 1);
      for (let c = colFrom; c <= colTo; c++) {
        const isFrozen = c < this.frozenColumnCount;
        const x = isFrozen
          ? (this.cumulativeColumnWidths[c] ?? 0)
          : this.frozenWidth +
            ((this.cumulativeColumnWidths[c] ?? 0) -
              (this.cumulativeColumnWidths[this.frozenColumnCount] ?? 0)) -
            this.scrollLeft;
        const w = this.columns[c]?.width ?? 0;
        if (x + w < 0 || x > this.viewportWidth) continue;
        ctx.fillStyle = 'rgba(110, 168, 254, 0.18)';
        ctx.fillRect(x, yTop, w, h);
      }
    }

    if (active && active.row >= start && active.row <= end) {
      const isFrozen = active.col < this.frozenColumnCount;
      const x = isFrozen
        ? (this.cumulativeColumnWidths[active.col] ?? 0)
        : this.frozenWidth +
          ((this.cumulativeColumnWidths[active.col] ?? 0) -
            (this.cumulativeColumnWidths[this.frozenColumnCount] ?? 0)) -
          this.scrollLeft;
      const y = this.headerHeight + (this.fenwick.prefixSum(active.row) - this.scrollTop);
      const w = this.columns[active.col]?.width ?? 0;
      const h = this.fenwick.get(active.row);
      ctx.strokeStyle = '#6ea8fe';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    }
  }

  private drawRows(
    start: number,
    end: number,
    firstRowTop: number,
    colStart: number,
    colEnd: number,
    horizontalOffset: number,
  ): number {
    const ctx = this.ctx;
    const theme = this.theme;
    let y = this.headerHeight + (firstRowTop - this.scrollTop);
    let drawn = 0;

    ctx.font = `${String(theme.fontSize)}px ${theme.fontFamily}`;
    ctx.textBaseline = 'middle';

    for (let row = start; row <= end; row++) {
      const h = this.fenwick.get(row);

      ctx.fillStyle = row % 2 === 0 ? theme.background : theme.altRowBackground;
      ctx.fillRect(0, y, this.viewportWidth, h);

      let x = -horizontalOffset;
      if (colStart > 0) {
        x += this.cumulativeColumnWidths[colStart] ?? 0;
      }

      for (let col = colStart; col < colEnd; col++) {
        const column = this.columns[col];
        if (!column) continue;
        const w = column.width;

        if (x + w >= 0 && x <= this.viewportWidth) {
          const value = this.rowSource.getCell(row, column.id);
          const text = column.format ? column.format(value, row) : String(value ?? '');
          const fg = column.color?.(value, row) ?? theme.text;
          const bg = column.background?.(value, row);

          if (bg) {
            ctx.fillStyle = bg;
            ctx.fillRect(x, y, w, h);
          }

          ctx.fillStyle = fg;
          ctx.save();
          ctx.beginPath();
          ctx.rect(x + 8, y, w - 16, h);
          ctx.clip();
          ctx.fillText(text, x + 12, y + h / 2 + 1);
          ctx.restore();

          ctx.strokeStyle = theme.border;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x + w - 0.5, y);
          ctx.lineTo(x + w - 0.5, y + h);
          ctx.stroke();
          drawn++;
        }
        x += w;
      }

      ctx.strokeStyle = theme.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y + h - 0.5);
      ctx.lineTo(this.viewportWidth, y + h - 0.5);
      ctx.stroke();

      y += h;
    }

    return drawn;
  }

  private drawHeader(): void {
    const ctx = this.ctx;
    const theme = this.theme;
    ctx.fillStyle = theme.headerBackground;
    ctx.fillRect(0, 0, this.viewportWidth, this.headerHeight);

    ctx.font = `600 ${String(theme.fontSize - 1)}px ${theme.fontFamily}`;
    ctx.textBaseline = 'middle';

    const drawCell = (column: ColumnDef, x: number): void => {
      const sortIndex = this.sort.findIndex((s) => s.columnId === column.id);
      const sortField = sortIndex >= 0 ? this.sort[sortIndex] : undefined;
      const arrow = sortField
        ? sortField.direction === 'asc'
          ? ' \u25B2'
          : ' \u25BC'
        : '';
      const label = (column.displayName ?? column.id) + arrow;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 8, 0, column.width - 16, this.headerHeight);
      ctx.clip();
      ctx.fillStyle = sortField ? theme.text : theme.text;
      ctx.fillText(label, x + 12, this.headerHeight / 2 + 1);
      // Subtle hover-affordance hint: muted underline for sortable columns
      // when a sort is active elsewhere.
      ctx.restore();
      // For multi-column sort, draw a small priority badge.
      if (sortField && this.sort.length > 1) {
        ctx.font = `500 ${String(theme.fontSize - 3)}px ${theme.fontFamily}`;
        ctx.fillStyle = theme.mutedText;
        ctx.fillText(String(sortIndex + 1), x + column.width - 14, this.headerHeight / 2 + 1);
        ctx.font = `600 ${String(theme.fontSize - 1)}px ${theme.fontFamily}`;
      }
    };

    let x = -this.scrollLeft + (this.cumulativeColumnWidths[this.frozenColumnCount] ?? 0);
    for (let col = this.frozenColumnCount; col < this.columns.length; col++) {
      const column = this.columns[col];
      if (!column) continue;
      ctx.fillStyle = theme.text;
      drawCell(column, x);
      x += column.width;
    }

    if (this.frozenColumnCount > 0) {
      let fx = 0;
      for (let col = 0; col < this.frozenColumnCount; col++) {
        const column = this.columns[col];
        if (!column) continue;
        ctx.fillStyle = theme.headerBackground;
        ctx.fillRect(fx, 0, column.width, this.headerHeight);
        ctx.fillStyle = theme.text;
        drawCell(column, fx);
        fx += column.width;
      }
    }

    ctx.strokeStyle = '#2a2f37';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, this.headerHeight - 0.5);
    ctx.lineTo(this.viewportWidth, this.headerHeight - 0.5);
    ctx.stroke();
  }

  private velocityAwareOverscan(): number {
    if (this.velocity > 200) return 12;
    if (this.velocity > 50) return 6;
    return 2;
  }

  // ---------------------------------------------------------------------------
  // Accessibility shadow
  // ---------------------------------------------------------------------------

  private updateAccessibilityShadow(start: number, end: number): void {
    const max = Math.min(end, start + 80);
    const rows: string[] = [];
    rows.push('<table role="grid"><thead><tr role="row">');
    for (const col of this.columns) {
      rows.push(`<th role="columnheader">${escapeHtml(col.displayName ?? col.id)}</th>`);
    }
    rows.push('</tr></thead><tbody>');
    for (let r = start; r <= max; r++) {
      rows.push(`<tr role="row" aria-rowindex="${String(r + 2)}">`);
      for (let c = 0; c < this.columns.length; c++) {
        const col = this.columns[c];
        if (!col) continue;
        const value = this.rowSource.getCell(r, col.id);
        const text = col.format ? col.format(value, r) : String(value ?? '');
        rows.push(
          `<td role="gridcell" aria-colindex="${String(c + 1)}" tabindex="-1">${escapeHtml(text)}</td>`,
        );
      }
      rows.push('</tr>');
    }
    rows.push('</tbody></table>');
    this.a11yMount.innerHTML = rows.join('');
  }
}

const EMPTY_SNAPSHOT: MetricsSnapshot = {
  windowMs: 0,
  frameCount: 0,
  fpsAvg: 0,
  intervalMsP50: 0,
  intervalMsP95: 0,
  intervalMsP99: 0,
  drawMsP50: 0,
  drawMsP95: 0,
  drawMsP99: 0,
  longFramesGt16: 0,
  longFramesGt33: 0,
  longFramesGt50: 0,
  scrollPxTotal: 0,
  cellsPerFrameAvg: 0,
};

function colAtX(
  cumulative: Float32Array,
  x: number,
  start: number,
  endExclusive: number,
): number {
  for (let c = start; c < endExclusive; c++) {
    if ((cumulative[c + 1] ?? 0) > x) return c;
  }
  return endExclusive - 1;
}

function percentile(sorted: ReadonlyArray<number>, p: number): number {
  if (sorted.length === 0) return 0;
  const arr = [...sorted].sort((a, b) => a - b);
  const idx = Math.min(arr.length - 1, Math.max(0, Math.floor(p * (arr.length - 1))));
  return Math.round((arr[idx] ?? 0) * 100) / 100;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return ch;
    }
  });
}
