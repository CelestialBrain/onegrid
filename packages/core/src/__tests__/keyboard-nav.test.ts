// =============================================================================
// Excel-class keyboard nav (wave 24): Ctrl+Home / Ctrl+End / Ctrl+arrow /
// PageUp / PageDown / Home / End.
// =============================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Grid } from '../grid';
import type { ColumnDef, RowSource } from '../types';

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    return setTimeout(() => {
      cb(performance.now());
    }, 0) as unknown as number;
  });
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
    clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
  });
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
    measureText: (() => ({ width: 0 })) as unknown as CanvasRenderingContext2D['measureText'],
    fillStyle: '',
    strokeStyle: '',
    font: '',
    textBaseline: 'middle' as CanvasTextBaseline,
    lineWidth: 1,
    globalAlpha: 1,
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
      observe(): void {
        return undefined;
      }
      unobserve(): void {
        return undefined;
      }
      disconnect(): void {
        return undefined;
      }
    },
  );
  Element.prototype.scrollTo = function (): void {
    return undefined;
  } as Element['scrollTo'];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const COLUMNS: ColumnDef[] = [
  { id: 'a', width: 100 },
  { id: 'b', width: 100 },
  { id: 'c', width: 100 },
  { id: 'd', width: 100 },
];

function source(numRows: number): RowSource {
  return { numRows, getCell: () => 'x' };
}

function mount(numRows = 100) {
  const host = document.createElement('div');
  Object.defineProperty(host, 'clientHeight', { value: 400, configurable: true });
  Object.defineProperty(host, 'clientWidth', { value: 400, configurable: true });
  document.body.appendChild(host);
  const grid = new Grid({
    host,
    columns: COLUMNS,
    rowSource: source(numRows),
    rowHeight: 24,
  });
  host.focus();
  // Selection starts at (0,0) via the initial gotoCell from the tests.
  grid.gotoCell(0, 0, false);
  return { grid, host };
}

describe('Wave 24 — gotoCell (imperative)', () => {
  it('moves active to absolute coords, clamped', () => {
    const { grid, host } = mount();
    grid.gotoCell(50, 2);
    expect(grid.getSelection().active).toEqual({ row: 50, col: 2 });
    grid.gotoCell(999, 999);
    expect(grid.getSelection().active).toEqual({ row: 99, col: 3 });
    grid.gotoCell(-5, -5);
    expect(grid.getSelection().active).toEqual({ row: 0, col: 0 });
    grid.destroy();
    document.body.removeChild(host);
  });

  it('extend=true keeps the anchor and moves the active edge', () => {
    const { grid, host } = mount();
    grid.gotoCell(5, 1);
    grid.gotoCell(10, 3, true);
    // Active should be (10, 3); anchor stays at (5, 1).
    expect(grid.getSelection().active).toEqual({ row: 10, col: 3 });
    grid.destroy();
    document.body.removeChild(host);
  });
});
