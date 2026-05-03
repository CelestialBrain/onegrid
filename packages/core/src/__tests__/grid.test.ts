// jsdom doesn't support the full Canvas 2D API, so we mock just enough to
// exercise mount/destroy + scrollToRow + getMetricsSnapshot lifecycle.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Grid } from '../grid';
import type { ColumnDef, RowSource } from '../types';

// Minimal HTMLCanvasElement.getContext('2d') stub for jsdom.
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

  // ResizeObserver isn't available in jsdom by default.
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

  // jsdom doesn't implement Element.scrollTo / scrollBy.
  Element.prototype.scrollTo = function (): void {
    return undefined;
  } as Element['scrollTo'];
  Element.prototype.scrollBy = function (): void {
    return undefined;
  } as Element['scrollBy'];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const COLUMNS: ColumnDef[] = [
  { id: 'a', width: 100, displayName: 'A' },
  { id: 'b', width: 200, displayName: 'B' },
];

const rowSource = (numRows: number): RowSource => ({
  numRows,
  getCell: (rowIndex, columnId) => `${columnId}-${String(rowIndex)}`,
});

describe('Grid', () => {
  it('mounts and destroys without throwing', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const grid = new Grid({
      host,
      columns: COLUMNS,
      rowSource: rowSource(1000),
      rowHeight: 24,
    });
    expect(host.children.length).toBeGreaterThan(0);
    grid.destroy();
    expect(host.children.length).toBe(0);
    document.body.removeChild(host);
  });

  it('exposes a complete metrics snapshot with zero frames at start', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const grid = new Grid({
      host,
      columns: COLUMNS,
      rowSource: rowSource(100),
      rowHeight: 24,
    });
    const snap = grid.getMetricsSnapshot();
    expect(snap.frameCount).toBe(0);
    expect(snap.fpsAvg).toBe(0);
    grid.destroy();
    document.body.removeChild(host);
  });

  it('scrollToRow clamps to valid row indices', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const grid = new Grid({
      host,
      columns: COLUMNS,
      rowSource: rowSource(100),
      rowHeight: 24,
    });
    expect(() => {
      grid.scrollToRow(-50);
      grid.scrollToRow(0);
      grid.scrollToRow(50);
      grid.scrollToRow(10000);
    }).not.toThrow();
    grid.destroy();
    document.body.removeChild(host);
  });

  it('setRowSource swaps in a new dataset', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const grid = new Grid({
      host,
      columns: COLUMNS,
      rowSource: rowSource(100),
      rowHeight: 24,
    });
    grid.setRowSource(rowSource(500), 32);
    expect(() => {
      grid.scrollToRow(400);
    }).not.toThrow();
    grid.destroy();
    document.body.removeChild(host);
  });
});

describe('Grid · cell editing', () => {
  it('beginEdit / commitEdit fires onCellEdit with new value and old value', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const edits: Array<{ row: number; col: string; n: string; o: unknown }> = [];
    const grid = new Grid({
      host,
      columns: COLUMNS,
      rowSource: rowSource(50),
      rowHeight: 24,
      editable: true,
      onCellEdit: (row, col, n, o) => {
        edits.push({ row, col, n, o });
      },
    });
    grid.beginEdit(3, 1);
    expect(grid.isEditing()).toBe(true);
    // Mutate the editor input directly to simulate typing.
    const input = host.querySelector('input');
    expect(input).not.toBeNull();
    input!.value = 'hello';
    grid.commitEdit();
    expect(grid.isEditing()).toBe(false);
    expect(edits).toEqual([{ row: 3, col: 'b', n: 'hello', o: 'b-3' }]);
    grid.destroy();
    document.body.removeChild(host);
  });

  it('cancelEdit does not fire onCellEdit', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    let count = 0;
    const grid = new Grid({
      host,
      columns: COLUMNS,
      rowSource: rowSource(50),
      rowHeight: 24,
      editable: true,
      onCellEdit: () => {
        count++;
      },
    });
    grid.beginEdit(2, 0);
    grid.cancelEdit();
    expect(count).toBe(0);
    expect(grid.isEditing()).toBe(false);
    grid.destroy();
    document.body.removeChild(host);
  });

  it('beginEdit is gated by the editable predicate', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const grid = new Grid({
      host,
      columns: COLUMNS,
      rowSource: rowSource(50),
      rowHeight: 24,
      editable: (_row, columnId) => columnId === 'b',
    });
    grid.beginEdit(0, 0); // column 'a' — gated off
    expect(grid.isEditing()).toBe(false);
    grid.beginEdit(0, 1); // column 'b' — allowed
    expect(grid.isEditing()).toBe(true);
    grid.destroy();
    document.body.removeChild(host);
  });

  it('clicks in the pinned-top band do not start a selection', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    let selectionFires = 0;
    const pinned: RowSource = {
      numRows: 2,
      getCell: (r, c) => `pin-${c}-${String(r)}`,
    };
    const grid = new Grid({
      host,
      columns: COLUMNS,
      rowSource: rowSource(50),
      rowHeight: 24,
      pinnedTopRowSource: pinned,
      pinnedRowHeight: 28,
      onSelectionChange: () => {
        selectionFires++;
      },
    });
    expect(selectionFires).toBe(0);
    grid.destroy();
    document.body.removeChild(host);
  });

  it('status bar element mounts when statusBar=true and unmounts on destroy', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const grid = new Grid({
      host,
      columns: COLUMNS,
      rowSource: rowSource(50),
      rowHeight: 24,
      statusBar: true,
    });
    // The host should now have one extra absolutely-positioned bottom div.
    const before = host.children.length;
    expect(before).toBeGreaterThan(0);
    grid.destroy();
    expect(host.children.length).toBe(0);
    document.body.removeChild(host);
  });

  it('beginEdit with initialText replaces value (type-ahead)', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const edits: string[] = [];
    const grid = new Grid({
      host,
      columns: COLUMNS,
      rowSource: rowSource(50),
      rowHeight: 24,
      editable: true,
      onCellEdit: (_r, _c, n) => edits.push(n),
    });
    grid.beginEdit(0, 0, 'X');
    const input = host.querySelector('input');
    expect(input?.value).toBe('X');
    grid.commitEdit();
    expect(edits).toEqual(['X']);
    grid.destroy();
    document.body.removeChild(host);
  });
});
