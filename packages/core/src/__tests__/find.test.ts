// =============================================================================
// Find / replace (wave 25).
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
];

function makeSource(): { source: RowSource; data: Map<string, string> } {
  const data = new Map<string, string>();
  data.set('0:a', 'apple');
  data.set('0:b', 'red fruit');
  data.set('1:a', 'banana');
  data.set('1:b', 'yellow fruit');
  data.set('2:a', 'cherry');
  data.set('2:b', 'red fruit');
  data.set('3:a', 'date');
  data.set('3:b', 'brown fruit');
  const source: RowSource = {
    numRows: 4,
    getCell: (rowIndex, columnId) => data.get(`${String(rowIndex)}:${columnId}`) ?? '',
  };
  return { source, data };
}

describe('Wave 25 — Find / replace', () => {
  it('mounts a find toolbar when enableFind is true', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const grid = new Grid({
      host,
      columns: COLUMNS,
      rowSource: makeSource().source,
      rowHeight: 24,
      enableFind: true,
    });
    const toolbar = host.querySelector('[role="toolbar"]');
    expect(toolbar).not.toBeNull();
    expect(toolbar?.getAttribute('aria-label')).toBe('Find and replace');
    expect((toolbar as HTMLElement).style.display).toBe('none');
    grid.destroy();
    document.body.removeChild(host);
  });

  it('does NOT mount a find toolbar when enableFind is false (default)', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const grid = new Grid({
      host,
      columns: COLUMNS,
      rowSource: makeSource().source,
      rowHeight: 24,
    });
    expect(host.querySelector('[role="toolbar"]')).toBeNull();
    grid.destroy();
    document.body.removeChild(host);
  });

  it('openFind shows the toolbar, closeFind hides it', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const grid = new Grid({
      host,
      columns: COLUMNS,
      rowSource: makeSource().source,
      rowHeight: 24,
      enableFind: true,
    });
    const toolbar = host.querySelector('[role="toolbar"]') as HTMLElement;
    grid.openFind();
    expect(toolbar.style.display).toBe('flex');
    grid.closeFind();
    expect(toolbar.style.display).toBe('none');
    grid.destroy();
    document.body.removeChild(host);
  });

  it('findNext steps forward through matches (case-insensitive substring)', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const grid = new Grid({
      host,
      columns: COLUMNS,
      rowSource: makeSource().source,
      rowHeight: 24,
      enableFind: true,
    });
    grid.gotoCell(0, 0);
    grid.setFindQuery('red');
    expect(grid.findNext()).toBe(true);
    // Should land on (0, 'b') — the first 'red fruit' cell.
    const active = grid.getSelection().active!;
    expect({ row: active.row, col: active.col }).toEqual({ row: 0, col: 1 });
    expect(grid.findNext()).toBe(true);
    const next = grid.getSelection().active!;
    expect({ row: next.row, col: next.col }).toEqual({ row: 2, col: 1 });
    grid.destroy();
    document.body.removeChild(host);
  });

  it('findNext wraps to start when past the last match', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const grid = new Grid({
      host,
      columns: COLUMNS,
      rowSource: makeSource().source,
      rowHeight: 24,
      enableFind: true,
    });
    grid.setFindQuery('apple');
    expect(grid.findNext()).toBe(true);
    const first = grid.getSelection().active!;
    expect({ row: first.row, col: first.col }).toEqual({ row: 0, col: 0 });
    // Only one match — calling again should land back on the same cell.
    expect(grid.findNext()).toBe(true);
    const wrapped = grid.getSelection().active!;
    expect({ row: wrapped.row, col: wrapped.col }).toEqual({ row: 0, col: 0 });
    grid.destroy();
    document.body.removeChild(host);
  });

  it('findNext returns false when the query has no matches', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const grid = new Grid({
      host,
      columns: COLUMNS,
      rowSource: makeSource().source,
      rowHeight: 24,
      enableFind: true,
    });
    grid.setFindQuery('xyzzyx');
    expect(grid.findNext()).toBe(false);
    grid.destroy();
    document.body.removeChild(host);
  });

  it('replaceAll fires onReplace for every visible match', () => {
    const host = document.createElement('div');
    Object.defineProperty(host, 'clientHeight', { value: 400, configurable: true });
    Object.defineProperty(host, 'clientWidth', { value: 400, configurable: true });
    document.body.appendChild(host);
    const onReplace = vi.fn();
    const grid = new Grid({
      host,
      columns: COLUMNS,
      rowSource: makeSource().source,
      rowHeight: 24,
      enableFind: true,
      onReplace,
    });
    grid.setFindQuery('red');
    const n = grid.replaceAll('crimson');
    expect(n).toBe(2);
    expect(onReplace).toHaveBeenCalledTimes(2);
    grid.destroy();
    document.body.removeChild(host);
  });

  it('replaceAll without enableFind / onReplace returns 0', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const grid = new Grid({
      host,
      columns: COLUMNS,
      rowSource: makeSource().source,
      rowHeight: 24,
      enableFind: true,
    });
    grid.setFindQuery('red');
    expect(grid.replaceAll('x')).toBe(0);
    grid.destroy();
    document.body.removeChild(host);
  });
});
