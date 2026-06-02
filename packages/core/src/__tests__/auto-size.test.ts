// =============================================================================
// Auto-size column to content (wave 24).
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
  // Stub measureText to a deterministic width = text length * 7px.
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
    measureText: ((text: string) => ({
      width: text.length * 7,
    })) as CanvasRenderingContext2D['measureText'],
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
  { id: 'short', width: 200, displayName: 'X' },
  { id: 'long', width: 50, displayName: 'Y' },
];

function source(numRows: number): RowSource {
  return {
    numRows,
    getCell: (rowIndex, columnId) => {
      if (columnId === 'short') return 'a';
      if (columnId === 'long') return 'longer-value-' + String(rowIndex);
      return '';
    },
  };
}

describe('Wave 24 — Auto-size column to content', () => {
  it('autoSizeColumn shrinks an oversized column to fit short content', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const grid = new Grid({
      host,
      columns: COLUMNS,
      rowSource: source(20),
      rowHeight: 24,
      enableColumnResize: true,
    });
    grid.autoSizeColumn('short');
    // After auto-size, 'short' should be much narrower than 200.
    // Min content is just the header 'X' (1 char) + 'a' (1 char) → padding-bound.
    const next = grid.getColumns().find((c) => c.id === 'short')?.width ?? 0;
    expect(next).toBeLessThan(200);
    expect(next).toBeGreaterThan(0);
    grid.destroy();
    document.body.removeChild(host);
  });

  it('autoSizeColumn fires onColumnResize with finalCommit=true', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const onResize = vi.fn();
    const grid = new Grid({
      host,
      columns: COLUMNS,
      rowSource: source(10),
      rowHeight: 24,
      enableColumnResize: true,
      onColumnResize: onResize,
    });
    grid.autoSizeColumn('short');
    expect(onResize).toHaveBeenCalledTimes(1);
    expect(onResize.mock.calls[0]?.[0]).toBe('short');
    expect(onResize.mock.calls[0]?.[2]).toBe(true);
    grid.destroy();
    document.body.removeChild(host);
  });

  it('autoSizeColumns loops over every column', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const onResize = vi.fn();
    const grid = new Grid({
      host,
      columns: COLUMNS,
      rowSource: source(10),
      rowHeight: 24,
      enableColumnResize: true,
      onColumnResize: onResize,
    });
    grid.autoSizeColumns();
    // Both columns should have fired (one or both may match width and no-op).
    expect(onResize.mock.calls.length).toBeGreaterThanOrEqual(1);
    grid.destroy();
    document.body.removeChild(host);
  });

  it('honors minWidth / maxWidth', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const COLS: ColumnDef[] = [
      { id: 'a', width: 200, minWidth: 150, maxWidth: 300, displayName: 'A' },
    ];
    const grid = new Grid({
      host,
      columns: COLS,
      rowSource: source(10),
      rowHeight: 24,
    });
    grid.autoSizeColumn('a');
    const w = grid.getColumns().find((c) => c.id === 'a')?.width ?? 0;
    expect(w).toBeGreaterThanOrEqual(150);
    expect(w).toBeLessThanOrEqual(300);
    grid.destroy();
    document.body.removeChild(host);
  });

  it('autoSizeColumn does nothing for unknown columnId', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const onResize = vi.fn();
    const grid = new Grid({
      host,
      columns: COLUMNS,
      rowSource: source(10),
      rowHeight: 24,
      onColumnResize: onResize,
    });
    expect(() => grid.autoSizeColumn('nonexistent')).not.toThrow();
    expect(onResize).not.toHaveBeenCalled();
    grid.destroy();
    document.body.removeChild(host);
  });
});
