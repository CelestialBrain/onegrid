// =============================================================================
// Mid-table row pinning (wave 26).
//
// The pin-painting is a canvas drawing operation we can't easily inspect
// in jsdom. These tests verify the meta-discrimination + lifecycle path:
// rows with `RowDataMeta { pinned: 'top' | 'bottom' }` don't break the
// existing render loop, and `getRowMeta` returning the new kind is
// consumed without throwing.
// =============================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Grid } from '../grid';
import type { ColumnDef, RowSource, RowMeta } from '../types';

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

const COLUMNS: ColumnDef[] = [{ id: 'a', width: 100 }];

function source(numRows: number): RowSource {
  return { numRows, getCell: () => 'x' };
}

describe('Wave 26 — Mid-table row pinning', () => {
  it('accepts getRowMeta returning RowDataMeta without throwing', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const getRowMeta = vi.fn(
      (rowIndex: number): RowMeta | null => {
        if (rowIndex === 0) return { kind: 'data', pinned: 'top' };
        if (rowIndex === 9) return { kind: 'data', pinned: 'bottom' };
        return null;
      },
    );
    const grid = new Grid({
      host,
      columns: COLUMNS,
      rowSource: source(10),
      rowHeight: 24,
      getRowMeta,
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(getRowMeta).toHaveBeenCalled();
    grid.destroy();
    document.body.removeChild(host);
  });

  it('falls through to default rendering for null / undefined meta', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const grid = new Grid({
      host,
      columns: COLUMNS,
      rowSource: source(10),
      rowHeight: 24,
      getRowMeta: () => null,
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(() => grid.destroy()).not.toThrow();
    document.body.removeChild(host);
  });

  it('mixes pinned data rows with existing group + tree meta kinds', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const grid = new Grid({
      host,
      columns: COLUMNS,
      rowSource: source(20),
      rowHeight: 24,
      getRowMeta: (rowIndex) => {
        if (rowIndex === 0) return { kind: 'data', pinned: 'top' };
        if (rowIndex === 5) {
          return {
            kind: 'group',
            depth: 0,
            label: 'G',
            path: 'g',
            expanded: true,
          };
        }
        if (rowIndex === 10) {
          return {
            kind: 'tree',
            depth: 0,
            id: 't',
            expanded: false,
            isLeaf: true,
            hasChildren: false,
          };
        }
        if (rowIndex === 19) return { kind: 'data', pinned: 'bottom' };
        return null;
      },
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(() => grid.destroy()).not.toThrow();
    document.body.removeChild(host);
  });
});
