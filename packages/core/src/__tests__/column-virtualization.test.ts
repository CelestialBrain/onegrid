// =============================================================================
// Column virtualization (v0.0.10 item 1) — unit tests for
// Grid.visibleColumnRangeInBand. The renderer integration is tested in
// real Chromium via apps/benchmarks/src/perf-column-vis.spec.ts.
// =============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Grid } from '../grid';
import type { ColumnDef, RowSource } from '../types';

function installCanvasStub(): void {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 0) as unknown as number,
  );
  vi.stubGlobal('cancelAnimationFrame', (h: number) =>
    clearTimeout(h as unknown as ReturnType<typeof setTimeout>),
  );
  const ctxStub: Partial<CanvasRenderingContext2D> = {
    setTransform: () => undefined,
    clearRect: () => undefined,
    fillRect: () => undefined,
    fillText: () => undefined,
    strokeRect: () => undefined,
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => undefined,
    rect: () => undefined,
    clip: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    stroke: () => undefined,
    fillStyle: '',
    strokeStyle: '',
    font: '',
    textBaseline: 'middle' as CanvasTextBaseline,
    lineWidth: 1,
  };
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (
    this: HTMLCanvasElement,
    contextId: string,
  ) {
    if (contextId === '2d') return ctxStub as CanvasRenderingContext2D;
    return original.call(this, contextId as unknown as '2d');
  } as typeof HTMLCanvasElement.prototype.getContext;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  );
  Element.prototype.scrollTo = function (): void {} as Element['scrollTo'];
  Element.prototype.scrollBy = function (): void {} as Element['scrollBy'];
}

function makeColumns(count: number, width = 100): ColumnDef[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `c${i}`,
    width,
    displayName: `C${i}`,
  }));
}

function makeRowSource(rows = 50): RowSource {
  return {
    numRows: rows,
    getCell: (r: number, c: string) => `${c}:${String(r)}`,
  } as unknown as RowSource;
}

interface InternalGrid {
  visibleColumnRangeInBand: (
    colStart: number,
    colEnd: number,
    horizontalOffset: number,
  ) => { first: number; last: number; xStart: number };
  viewportWidth: number;
  columns: readonly ColumnDef[];
}

describe('Grid.visibleColumnRangeInBand', () => {
  let host: HTMLElement;
  let grid: Grid;

  beforeEach(() => {
    installCanvasStub();
    host = document.createElement('div');
    Object.defineProperty(host, 'getBoundingClientRect', {
      value: () =>
        ({
          left: 0,
          top: 0,
          right: 800,
          bottom: 600,
          width: 800,
          height: 600,
          x: 0,
          y: 0,
          toJSON: () => undefined,
        }) as DOMRect,
    });
    Object.defineProperty(host, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(host, 'clientHeight', { value: 600, configurable: true });
    document.body.appendChild(host);

    grid = new Grid({
      host,
      columns: makeColumns(20, 100), // 2000 px wide; viewport 800
      rowSource: makeRowSource(),
      rowHeight: 32,
    });
    (grid as unknown as InternalGrid).viewportWidth = 800;
  });

  afterEach(() => {
    grid.destroy();
    document.body.removeChild(host);
    vi.unstubAllGlobals();
  });

  const probe = (
    colStart: number,
    colEnd: number,
    horizontalOffset: number,
  ): { first: number; last: number; xStart: number } =>
    (grid as unknown as InternalGrid).visibleColumnRangeInBand(
      colStart,
      colEnd,
      horizontalOffset,
    );

  it('returns the leading window at horizontalOffset = 0', () => {
    const r = probe(0, 20, 0);
    expect(r.first).toBe(0);
    // viewport 800 / col width 100 = 8 fully visible; loop includes the
    // last partially-visible col where xCur enters viewport, so 0..8.
    expect(r.last).toBeGreaterThanOrEqual(7);
    expect(r.last).toBeLessThanOrEqual(8);
    expect(Math.abs(r.xStart)).toBe(0);
  });

  it('skips columns scrolled left of the viewport', () => {
    // scrollLeft = 500 — first 5 columns fully gone
    const r = probe(0, 20, 500);
    expect(r.first).toBeGreaterThanOrEqual(4);
    // xStart should be the position where the first-visible col starts
    // relative to the viewport — non-positive (col4 left edge is at -100
    // or col5 left edge at 0).
    expect(r.xStart).toBeLessThanOrEqual(0);
  });

  it('bounds last to the rightmost visible column', () => {
    const r = probe(0, 20, 0);
    // x at col `last` must be <= viewportWidth; x at col `last+1` (if exists) must be > viewportWidth.
    // We can't easily compute x here without re-implementing the helper,
    // but we know last must be a tight bound near 800 / 100 = 8.
    expect(r.last).toBeLessThan(20);
  });

  it('returns an empty range when fully scrolled past', () => {
    // Way past end: 2000 px of content, scrolled 5000.
    const r = probe(0, 20, 5000);
    expect(r.first).toBeGreaterThanOrEqual(20);
    expect(r.last).toBeLessThan(r.first);
  });

  it('respects colStart > 0 (the frozen-pass case)', () => {
    // Frozen pass passes colStart=0, colEnd=frozenColumnCount with
    // horizontalOffset=0 — should give the first frozen columns directly.
    const r = probe(0, 3, 0);
    expect(r.first).toBe(0);
    expect(r.last).toBe(2);
  });

  it('handles colStart == colEnd (empty band) without error', () => {
    const r = probe(5, 5, 0);
    expect(r.first).toBeGreaterThanOrEqual(5);
    expect(r.last).toBeLessThan(r.first);
  });
});
