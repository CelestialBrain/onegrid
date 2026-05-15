// =============================================================================
// Adaptive overscan (v0.0.10 item 2) — verifies the smoothed velocity EMA,
// direction-aware ahead/behind split, and bounded behavior at the stationary
// and high-velocity edges.
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

interface InternalGrid {
  adaptiveOverscan: () => { ahead: number; behind: number };
  velocitySmoothed: number;
  scrollDirection: -1 | 0 | 1;
}

describe('Grid.adaptiveOverscan', () => {
  let host: HTMLElement;
  let grid: Grid;
  let internal: InternalGrid;

  beforeEach(() => {
    installCanvasStub();
    host = document.createElement('div');
    document.body.appendChild(host);
    const columns: ColumnDef[] = [{ id: 'a', width: 100 }];
    const rowSource = {
      numRows: 1000,
      getCell: (r: number) => r,
    } as unknown as RowSource;
    grid = new Grid({ host, columns, rowSource, rowHeight: 32 });
    internal = grid as unknown as InternalGrid;
  });

  afterEach(() => {
    grid.destroy();
    document.body.removeChild(host);
    vi.unstubAllGlobals();
  });

  it('returns the stationary minimum (2 ahead, 2 behind) at zero velocity', () => {
    internal.velocitySmoothed = 0;
    internal.scrollDirection = 0;
    const r = internal.adaptiveOverscan();
    expect(r).toEqual({ ahead: 2, behind: 2 });
  });

  it('skews ahead-of-travel for a downward fling', () => {
    internal.velocitySmoothed = 300;
    internal.scrollDirection = 1;
    const r = internal.adaptiveOverscan();
    expect(r.ahead).toBeGreaterThan(r.behind);
    expect(r.ahead).toBe(16);
    expect(r.behind).toBe(4);
  });

  it('flips ahead/behind for an upward fling', () => {
    internal.velocitySmoothed = 300;
    internal.scrollDirection = -1;
    const r = internal.adaptiveOverscan();
    // direction reversed — the bigger window faces up now
    expect(r.behind).toBe(16);
    expect(r.ahead).toBe(4);
  });

  it('uses the mid tier (8/3) for moderate velocity', () => {
    internal.velocitySmoothed = 100;
    internal.scrollDirection = 1;
    expect(internal.adaptiveOverscan()).toEqual({ ahead: 8, behind: 3 });
  });

  it('uses the low tier (4/2) just above stationary noise floor', () => {
    internal.velocitySmoothed = 10;
    internal.scrollDirection = 1;
    expect(internal.adaptiveOverscan()).toEqual({ ahead: 4, behind: 2 });
  });
});

describe('Grid scroll EMA', () => {
  let host: HTMLElement;
  let grid: Grid;

  beforeEach(() => {
    installCanvasStub();
    host = document.createElement('div');
    document.body.appendChild(host);
    const columns: ColumnDef[] = [{ id: 'a', width: 100 }];
    const rowSource = {
      numRows: 1000,
      getCell: (r: number) => r,
    } as unknown as RowSource;
    grid = new Grid({ host, columns, rowSource, rowHeight: 32 });
  });

  afterEach(() => {
    grid.destroy();
    document.body.removeChild(host);
    vi.unstubAllGlobals();
  });

  it('damps a single-frame velocity spike', () => {
    const internal = grid as unknown as InternalGrid & {
      handleScroll: () => void;
      scrollHost: { scrollTop: number; scrollLeft: number };
      scrollTop: number;
    };
    // Simulate a 500px jump in one frame — raw velocity 500, but
    // EMA at α=0.4 from baseline 0 → 200, not 500.
    internal.scrollHost.scrollTop = 500;
    internal.scrollHost.scrollLeft = 0;
    internal.handleScroll();
    expect(internal.velocitySmoothed).toBeCloseTo(200, 1);
    // A subsequent zero-delta frame decays it further (200 * 0.6 = 120).
    internal.handleScroll();
    expect(internal.velocitySmoothed).toBeCloseTo(120, 1);
  });
});
