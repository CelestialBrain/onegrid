// =============================================================================
// Row drag-reorder (wave 26).
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
  { id: 'drag', width: 40 },
  { id: 'name', width: 100 },
];

function source(numRows: number): RowSource {
  return { numRows, getCell: () => 'x' };
}

describe('Wave 26 — Row drag-reorder', () => {
  it('accepts rowDragColumnId + onRowReorder options without throwing', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const onRowReorder = vi.fn();
    const grid = new Grid({
      host,
      columns: COLUMNS,
      rowSource: source(10),
      rowHeight: 24,
      rowDragColumnId: 'drag',
      onRowReorder,
    });
    expect(onRowReorder).not.toHaveBeenCalled();
    grid.destroy();
    document.body.removeChild(host);
  });

  it('without rowDragColumnId, no row-drag state is mounted', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const grid = new Grid({
      host,
      columns: COLUMNS,
      rowSource: source(10),
      rowHeight: 24,
    });
    // No drop indicator should be in the DOM at construction time
    // (it's only created on drag promotion).
    const blue = Array.from(host.children).find((c) =>
      (c as HTMLElement).style.background === 'rgb(110, 168, 254)',
    );
    expect(blue).toBeUndefined();
    grid.destroy();
    document.body.removeChild(host);
  });

  it('destroy cleans up the row-drag indicator when one is mounted', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const grid = new Grid({
      host,
      columns: COLUMNS,
      rowSource: source(10),
      rowHeight: 24,
      rowDragColumnId: 'drag',
      onRowReorder: () => undefined,
    });
    expect(() => grid.destroy()).not.toThrow();
    expect(host.children.length).toBe(0);
    document.body.removeChild(host);
  });
});
