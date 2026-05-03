/**
 * CanvasGrid — Phase 0 Spike A.
 *
 * Validates the riskiest unknown in oneGrid's architecture: can a Canvas-2D
 * renderer hit 60 FPS at 1M+ rows while supporting accessibility cleanly?
 *
 * Architecture:
 *   - <canvas> for pixels.
 *   - A native scrollbar over a tall transparent <div> for native scroll feel.
 *   - A Fenwick tree of row heights for O(log n) offsetForRow / rowAtOffset.
 *   - A hidden <table role="grid"> mirror of the visible viewport ± buffer
 *     for screen readers (the "accessibility shadow").
 *   - DPR-aware drawing for crisp text on retina.
 *   - velocity-aware overscan to avoid blank frames during fast flings.
 *
 * No framework dependency. The host is any HTMLElement.
 */

import { FenwickHeights } from './fenwick';
import type { SyntheticDataset } from './synthetic';

export interface CanvasGridOptions {
  readonly host: HTMLElement;
  readonly data: SyntheticDataset;
  readonly headerHeight?: number;
  readonly onFrame?: (stats: FrameStats) => void;
}

export interface FrameStats {
  readonly fps: number;
  readonly visibleRowStart: number;
  readonly visibleRowEnd: number;
  readonly drawCellsPerFrame: number;
  readonly drawDurationMs: number;
}

export interface FrameSample {
  /** Frame end timestamp (performance.now). */
  ts: number;
  /** ms inside render(). */
  drawDurationMs: number;
  /** Pixels scrolled since the previous frame (absolute). */
  scrollDelta: number;
  /** Cells drawn this frame. */
  cells: number;
}

export interface MetricsSnapshot {
  /** Wall-clock window covered by this snapshot, ms. */
  readonly windowMs: number;
  /** Number of frames recorded in the window. */
  readonly frameCount: number;
  /** Average FPS over the window. */
  readonly fpsAvg: number;
  /** Frame-interval percentiles (ms between frames). Lower is better. */
  readonly intervalMsP50: number;
  readonly intervalMsP95: number;
  readonly intervalMsP99: number;
  /** Draw-duration percentiles. */
  readonly drawMsP50: number;
  readonly drawMsP95: number;
  readonly drawMsP99: number;
  /** Long-frame counts (frames whose interval exceeded the threshold). */
  readonly longFramesGt16: number;
  readonly longFramesGt33: number;
  readonly longFramesGt50: number;
  /** Total scroll distance covered, px. */
  readonly scrollPxTotal: number;
  /** Mean cells drawn per frame. */
  readonly cellsPerFrameAvg: number;
  /** Memory snapshot if Chromium exposes it. */
  readonly heapUsedBytes?: number;
}

export class CanvasGrid {
  private readonly host: HTMLElement;
  private readonly headerHeight: number;
  private data: SyntheticDataset;
  private fenwick: FenwickHeights;

  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly scrollHost: HTMLDivElement;
  private readonly scrollSpacer: HTMLDivElement;
  private readonly a11yMount: HTMLDivElement;
  private readonly resizeObserver: ResizeObserver;
  private readonly onFrame: ((stats: FrameStats) => void) | undefined;

  private dpr: number = window.devicePixelRatio || 1;
  private viewportWidth = 0;
  private viewportHeight = 0;
  private scrollTop = 0;
  private scrollLeft = 0;
  private lastRenderedScrollTop = -1;
  private lastRenderedScrollLeft = -1;

  private rafHandle: number | null = null;
  private needsRender = true;
  private destroyed = false;

  /**
   * Circular buffer of recent frames. ~30 s of samples at 60 FPS = 1800
   * entries; we cap to 4096 to be safe at high refresh rates.
   */
  private readonly frameBufferCap = 4096;
  private readonly frameBuffer: FrameSample[] = [];
  private frameBufferHead = 0;
  private lastFrameTs = 0;
  private velocity = 0;
  private debugLog = false;

  private cumulativeColumnWidths: Float32Array;
  private totalColumnsWidth: number;
  private frozenColumnCount = 1;
  private frozenWidth: number;

  constructor(options: CanvasGridOptions) {
    this.host = options.host;
    this.headerHeight = options.headerHeight ?? 32;
    this.data = options.data;
    this.fenwick = new FenwickHeights(options.data.heights);
    this.onFrame = options.onFrame;

    this.host.style.position = 'relative';
    this.host.innerHTML = '';

    this.canvas = document.createElement('canvas');
    this.canvas.style.position = 'absolute';
    this.canvas.style.inset = '0';
    this.canvas.style.pointerEvents = 'none';
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('CanvasGrid: 2D context unavailable.');
    this.ctx = ctx;

    this.scrollHost = document.createElement('div');
    this.scrollHost.style.position = 'absolute';
    this.scrollHost.style.inset = '0';
    this.scrollHost.style.overflow = 'auto';
    this.scrollHost.style.outline = 'none';
    this.scrollHost.tabIndex = 0;
    this.scrollHost.setAttribute('role', 'grid');
    this.scrollHost.setAttribute('aria-rowcount', String(this.data.numRows));
    this.scrollHost.setAttribute('aria-colcount', String(this.data.columns.length));

    this.scrollSpacer = document.createElement('div');
    this.scrollSpacer.style.position = 'relative';
    this.scrollHost.appendChild(this.scrollSpacer);

    this.a11yMount = document.createElement('div');
    this.a11yMount.className = 'a11y-shadow';
    this.a11yMount.setAttribute('aria-hidden', 'false');

    this.host.appendChild(this.canvas);
    this.host.appendChild(this.scrollHost);
    this.host.appendChild(this.a11yMount);

    this.cumulativeColumnWidths = new Float32Array(this.data.columns.length + 1);
    this.totalColumnsWidth = 0;
    this.frozenWidth = 0;
    this.recomputeColumnLayout();

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.host);
    this.scrollHost.addEventListener('scroll', this.handleScroll, { passive: true });
    window.addEventListener('keydown', this.handleKeyDown);

    this.handleResize();
    this.scheduleRender();

    // Optional verbose console logging when ?debug=1 is in the URL.
    try {
      this.debugLog = new URLSearchParams(window.location.search).get('debug') === '1';
    } catch {
      this.debugLog = false;
    }
  }

  setData(data: SyntheticDataset): void {
    this.data = data;
    this.fenwick = new FenwickHeights(data.heights);
    this.scrollHost.setAttribute('aria-rowcount', String(data.numRows));
    this.scrollHost.setAttribute('aria-colcount', String(data.columns.length));
    this.scrollTop = 0;
    this.scrollLeft = 0;
    this.scrollHost.scrollTo(0, 0);
    this.recomputeColumnLayout();
    this.lastRenderedScrollTop = -1;
    this.lastRenderedScrollLeft = -1;
    this.scheduleRender();
  }

  destroy(): void {
    this.destroyed = true;
    if (this.rafHandle !== null) cancelAnimationFrame(this.rafHandle);
    this.resizeObserver.disconnect();
    this.scrollHost.removeEventListener('scroll', this.handleScroll);
    window.removeEventListener('keydown', this.handleKeyDown);
    this.host.innerHTML = '';
  }

  // ---------------------------------------------------------------------------

  private recomputeColumnLayout(): void {
    this.cumulativeColumnWidths = new Float32Array(this.data.columns.length + 1);
    let acc = 0;
    for (let i = 0; i < this.data.columns.length; i++) {
      acc += this.data.columns[i]?.width ?? 0;
      this.cumulativeColumnWidths[i + 1] = acc;
    }
    this.totalColumnsWidth = acc;
    let frozenWidth = 0;
    for (let i = 0; i < this.frozenColumnCount; i++) {
      frozenWidth += this.data.columns[i]?.width ?? 0;
    }
    this.frozenWidth = frozenWidth;
  }

  private handleResize = (): void => {
    const rect = this.host.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
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
    const pageStep = Math.max(1, Math.floor(this.viewportHeight / 24));
    let delta = 0;
    if (e.key === 'ArrowDown') delta = 24;
    else if (e.key === 'ArrowUp') delta = -24;
    else if (e.key === 'PageDown') delta = pageStep * 24;
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
      this.onFrame?.({ ...stats, drawDurationMs: t1 - t0, fps: this.computeRollingFps() });
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
    this.lastFrameTs = ts;
    if (this.debugLog && drawDurationMs > 16) {
      // eslint-disable-next-line no-console
      console.warn(
        `[onegrid] long frame ${drawDurationMs.toFixed(1)}ms (cells=${cells}, dy=${scrollDelta.toFixed(0)}px)`,
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
    // Last 1 s window for the live UI meter — same semantics as before.
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

  /**
   * Snapshot the entire frame buffer with percentiles. Cheap to call ad-hoc
   * (it's O(n log n) sort over up to 4k samples). Designed for benchmark
   * harnesses to read after a scripted interaction.
   */
  getMetricsSnapshot(): MetricsSnapshot {
    const frames = this.framesInOrder();
    const frameCount = frames.length;
    if (frameCount === 0) {
      return {
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
    }
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
      typeof performance !== 'undefined' &&
      'memory' in performance &&
      typeof (performance as PerformanceWithMemory).memory?.usedJSHeapSize === 'number'
        ? (performance as PerformanceWithMemory).memory!.usedJSHeapSize
        : undefined;

    const result: MetricsSnapshot = {
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
    return result;
  }

  /** Reset the metrics buffer. Call at the start of a benchmark scenario. */
  resetMetrics(): void {
    this.frameBuffer.length = 0;
    this.frameBufferHead = 0;
  }

  /** Imperative API for tests: scroll the grid by N pixels. */
  scrollBy(deltaY: number): void {
    this.scrollHost.scrollBy({ top: deltaY });
  }

  /** Imperative API for tests: scroll the grid to a row index. */
  scrollToRow(rowIndex: number): void {
    const top = this.fenwick.prefixSum(Math.max(0, Math.min(rowIndex, this.data.numRows - 1)));
    this.scrollHost.scrollTo({ top });
  }

  // ---------------------------------------------------------------------------

  private render(): Omit<FrameStats, 'fps' | 'drawDurationMs'> {
    const ctx = this.ctx;
    const dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.viewportWidth, this.viewportHeight);

    const overscan = this.velocityAwareOverscan();

    // Find visible row range.
    const start = Math.max(0, this.fenwick.indexAtOffset(this.scrollTop) - overscan);
    const endOffset = this.scrollTop + this.viewportHeight - this.headerHeight;
    const end = Math.min(this.data.numRows - 1, this.fenwick.indexAtOffset(endOffset) + overscan);

    const firstRowTop = this.fenwick.prefixSum(start);
    let drawnCells = 0;

    // ------ scrolling body (non-frozen columns) ------
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.frozenWidth, this.headerHeight, this.viewportWidth - this.frozenWidth, this.viewportHeight - this.headerHeight);
    ctx.clip();
    drawnCells += this.drawRows(start, end, firstRowTop, this.frozenColumnCount, this.data.columns.length, this.scrollLeft);
    ctx.restore();

    // ------ frozen columns ------
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, this.headerHeight, this.frozenWidth, this.viewportHeight - this.headerHeight);
    ctx.clip();
    drawnCells += this.drawRows(start, end, firstRowTop, 0, this.frozenColumnCount, 0);
    ctx.restore();

    // ------ header (always on top) ------
    this.drawHeader();

    this.updateAccessibilityShadow(start, end);

    return { visibleRowStart: start, visibleRowEnd: end, drawCellsPerFrame: drawnCells };
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
    let y = this.headerHeight + (firstRowTop - this.scrollTop);
    let drawn = 0;

    for (let row = start; row <= end; row++) {
      const h = this.fenwick.get(row);

      // Background — alternating zebra.
      ctx.fillStyle = row % 2 === 0 ? '#0b0d10' : '#11141a';
      ctx.fillRect(0, y, this.viewportWidth, h);

      ctx.font = `13px ui-sans-serif, system-ui, -apple-system, sans-serif`;
      ctx.textBaseline = 'middle';

      let x = -horizontalOffset;
      // skip columns before colStart in horizontal coords for the scrolling band
      if (colStart > 0) {
        x += this.cumulativeColumnWidths[colStart] ?? 0;
      }

      for (let col = colStart; col < colEnd; col++) {
        const column = this.data.columns[col];
        if (!column) continue;
        const w = column.width;

        // Only draw cells that intersect the viewport horizontally
        if (x + w >= 0 && x <= this.viewportWidth) {
          ctx.fillStyle = column.color?.(row) ?? '#e7e9ec';
          const text = column.format(row);
          ctx.save();
          ctx.beginPath();
          ctx.rect(x + 8, y, w - 16, h);
          ctx.clip();
          ctx.fillText(text, x + 12, y + h / 2 + 1);
          ctx.restore();

          // cell right border
          ctx.strokeStyle = '#1c2027';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x + w - 0.5, y);
          ctx.lineTo(x + w - 0.5, y + h);
          ctx.stroke();
          drawn++;
        }
        x += w;
      }

      // row separator
      ctx.strokeStyle = '#1c2027';
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
    ctx.fillStyle = '#1b1f26';
    ctx.fillRect(0, 0, this.viewportWidth, this.headerHeight);

    ctx.font = `600 12px ui-sans-serif, system-ui, -apple-system, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e7e9ec';

    let x = -this.scrollLeft + (this.cumulativeColumnWidths[this.frozenColumnCount] ?? 0);
    for (let col = this.frozenColumnCount; col < this.data.columns.length; col++) {
      const column = this.data.columns[col];
      if (!column) continue;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 8, 0, column.width - 16, this.headerHeight);
      ctx.clip();
      ctx.fillText(column.displayName, x + 12, this.headerHeight / 2 + 1);
      ctx.restore();
      x += column.width;
    }

    // frozen header columns last so they stay on top
    let fx = 0;
    for (let col = 0; col < this.frozenColumnCount; col++) {
      const column = this.data.columns[col];
      if (!column) continue;
      ctx.fillStyle = '#1b1f26';
      ctx.fillRect(fx, 0, column.width, this.headerHeight);
      ctx.fillStyle = '#e7e9ec';
      ctx.save();
      ctx.beginPath();
      ctx.rect(fx + 8, 0, column.width - 16, this.headerHeight);
      ctx.clip();
      ctx.fillText(column.displayName, fx + 12, this.headerHeight / 2 + 1);
      ctx.restore();
      fx += column.width;
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
  // Accessibility shadow: a hidden DOM table mirroring the visible viewport so
  // screen readers (NVDA, VoiceOver, JAWS) get a real ARIA grid to traverse.
  // Updated on every render — cheap because we only emit ~visible rows.
  // ---------------------------------------------------------------------------

  private updateAccessibilityShadow(start: number, end: number): void {
    const max = Math.min(end, start + 80);
    const rows: string[] = [];
    rows.push('<table role="grid"><thead><tr role="row">');
    for (const col of this.data.columns) {
      rows.push(`<th role="columnheader">${escapeHtml(col.displayName)}</th>`);
    }
    rows.push('</tr></thead><tbody>');
    for (let r = start; r <= max; r++) {
      rows.push(`<tr role="row" aria-rowindex="${r + 2}">`);
      for (let c = 0; c < this.data.columns.length; c++) {
        const col = this.data.columns[c];
        if (!col) continue;
        rows.push(
          `<td role="gridcell" aria-colindex="${c + 1}" tabindex="-1">${escapeHtml(col.format(r))}</td>`,
        );
      }
      rows.push('</tr>');
    }
    rows.push('</tbody></table>');
    this.a11yMount.innerHTML = rows.join('');
  }
}

interface PerformanceWithMemory extends Performance {
  readonly memory?: {
    readonly usedJSHeapSize: number;
    readonly totalJSHeapSize: number;
    readonly jsHeapSizeLimit: number;
  };
}

function percentile(sortedSrc: ReadonlyArray<number>, p: number): number {
  if (sortedSrc.length === 0) return 0;
  const sorted = [...sortedSrc].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return Math.round((sorted[idx] ?? 0) * 100) / 100;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return ch;
    }
  });
}

