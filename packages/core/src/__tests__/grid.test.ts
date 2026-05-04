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

  it('mounts ARIA grid semantics with a stable gridId and multi-selectable flag', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const grid = new Grid({
      host,
      columns: COLUMNS,
      rowSource: rowSource(50),
      rowHeight: 24,
    });
    const scrollHost = host.querySelector('[role="grid"]') as HTMLElement;
    expect(scrollHost).not.toBeNull();
    expect(scrollHost.id).toMatch(/^onegrid-\d+$/);
    expect(scrollHost.getAttribute('aria-rowcount')).toBe('50');
    expect(scrollHost.getAttribute('aria-colcount')).toBe('2');
    expect(scrollHost.getAttribute('aria-multiselectable')).toBe('true');
    grid.destroy();
    document.body.removeChild(host);
  });

  it('aria-activedescendant tracks the active cell and resolves to a live <td id>', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const grid = new Grid({
      host,
      columns: COLUMNS,
      rowSource: rowSource(200),
      rowHeight: 24,
    });
    grid.selectCell({ row: 7, col: 1 });
    // Force a render so the shadow is repopulated.
    grid.refresh();
    // Wait one rAF tick (set-timeout in our stub) so render() runs.
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const scrollHost = host.querySelector('[role="grid"]') as HTMLElement;
        const activeId = scrollHost.getAttribute('aria-activedescendant');
        expect(activeId).toMatch(/^onegrid-\d+-r7-c1$/);
        const cell = host.querySelector(`#${activeId}`) as HTMLElement;
        expect(cell).not.toBeNull();
        expect(cell.getAttribute('role')).toBe('gridcell');
        expect(cell.getAttribute('aria-selected')).toBe('true');
        grid.destroy();
        document.body.removeChild(host);
        resolve();
      }, 5);
    });
  });

  it('sync validator rejection keeps the editor open and announces the message', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const edits: string[] = [];
    const cols: ColumnDef[] = [
      { id: 'a', width: 100, displayName: 'A' },
      {
        id: 'b',
        width: 200,
        displayName: 'B',
        validate: (v) =>
          v.length < 3
            ? { ok: false, message: 'must be at least 3 chars' }
            : { ok: true },
      },
    ];
    const grid = new Grid({
      host,
      columns: cols,
      rowSource: rowSource(50),
      rowHeight: 24,
      editable: true,
      onCellEdit: (_r, _c, n) => edits.push(n),
    });
    grid.beginEdit(0, 1);
    const input = host.querySelector('input') as HTMLInputElement;
    input.value = 'hi'; // too short
    grid.commitEdit();
    expect(edits).toHaveLength(0);
    expect(grid.isEditing()).toBe(true);
    expect(input.getAttribute('aria-invalid')).toBeNull(); // not yet typed
    grid.destroy();
    document.body.removeChild(host);
  });

  it('async validator rejection (Promise) keeps the editor open', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const edits: string[] = [];
    const cols: ColumnDef[] = [
      { id: 'a', width: 100, displayName: 'A' },
      {
        id: 'b',
        width: 200,
        displayName: 'B',
        validate: async (v) =>
          v === 'taken'
            ? { ok: false, message: 'already taken' }
            : { ok: true },
      },
    ];
    const grid = new Grid({
      host,
      columns: cols,
      rowSource: rowSource(50),
      rowHeight: 24,
      editable: true,
      onCellEdit: (_r, _c, n) => edits.push(n),
    });
    grid.beginEdit(0, 1);
    const input = host.querySelector('input') as HTMLInputElement;
    input.value = 'taken';
    const result = grid.commitEdit();
    expect(result).toBeInstanceOf(Promise);
    await result;
    expect(edits).toHaveLength(0);
    expect(grid.isEditing()).toBe(true);
    grid.destroy();
    document.body.removeChild(host);
  });

  it('async validator success commits the edit', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const edits: string[] = [];
    const cols: ColumnDef[] = [
      { id: 'a', width: 100, displayName: 'A' },
      {
        id: 'b',
        width: 200,
        displayName: 'B',
        validate: async () => ({ ok: true }),
      },
    ];
    const grid = new Grid({
      host,
      columns: cols,
      rowSource: rowSource(50),
      rowHeight: 24,
      editable: true,
      onCellEdit: (_r, _c, n) => edits.push(n),
    });
    grid.beginEdit(0, 1);
    const input = host.querySelector('input') as HTMLInputElement;
    input.value = 'fine';
    await grid.commitEdit();
    expect(edits).toEqual(['fine']);
    grid.destroy();
    document.body.removeChild(host);
  });

  it('input-phase validator does not run while composing (skips partial codepoints)', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    let validatorCalls = 0;
    const cols: ColumnDef[] = [
      {
        id: 'a',
        width: 100,
        displayName: 'A',
        validate: () => {
          validatorCalls++;
          return { ok: true };
        },
      },
    ];
    const grid = new Grid({
      host,
      columns: cols,
      rowSource: rowSource(50),
      rowHeight: 24,
      editable: true,
    });
    grid.beginEdit(0, 0);
    const input = host.querySelector('input') as HTMLInputElement;
    // Start composition, dispatch input — validator must NOT run.
    input.dispatchEvent(new CompositionEvent('compositionstart'));
    input.value = 'n';
    input.dispatchEvent(new InputEvent('input'));
    expect(validatorCalls).toBe(0);
    grid.destroy();
    document.body.removeChild(host);
  });

  it('Enter does not commit while IME composition is active', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const edits: Array<{ row: number; col: string; n: string }> = [];
    const grid = new Grid({
      host,
      columns: COLUMNS,
      rowSource: rowSource(50),
      rowHeight: 24,
      editable: true,
      onCellEdit: (row, col, n) => {
        edits.push({ row, col, n });
      },
    });
    grid.beginEdit(0, 0);
    const input = host.querySelector('input') as HTMLInputElement;
    expect(input).not.toBeNull();

    // Start composition (e.g. user typed first Pinyin keystroke).
    input.dispatchEvent(new CompositionEvent('compositionstart'));
    input.value = 'n';

    // Enter while composing — IME would pick a candidate, NOT commit.
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(edits).toHaveLength(0);
    expect(grid.isEditing()).toBe(true);

    // Composition ends → final value lands.
    input.dispatchEvent(new CompositionEvent('compositionend', { data: '你' }));
    input.value = '你';

    // Now Enter commits.
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(edits).toEqual([{ row: 0, col: 'a', n: '你' }]);

    grid.destroy();
    document.body.removeChild(host);
  });

  it('Escape during IME composition does not cancel the edit', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const grid = new Grid({
      host,
      columns: COLUMNS,
      rowSource: rowSource(50),
      rowHeight: 24,
      editable: true,
    });
    grid.beginEdit(1, 1);
    const input = host.querySelector('input') as HTMLInputElement;
    input.dispatchEvent(new CompositionEvent('compositionstart'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(grid.isEditing()).toBe(true);
    grid.destroy();
    document.body.removeChild(host);
  });

  it('keyCode===229 (Android soft keyboard) is treated as composing', () => {
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
    grid.beginEdit(0, 0);
    const input = host.querySelector('input') as HTMLInputElement;
    // Android Chrome dispatches all soft-keyboard input as keyCode=229
    // with key="Unidentified". Enter should be ignored.
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true }),
    );
    expect(edits).toHaveLength(0);
    expect(grid.isEditing()).toBe(true);
    grid.destroy();
    document.body.removeChild(host);
  });

  it('mounts a custom cell renderer overlay when a column has a renderer', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    // jsdom returns 0×0 from getBoundingClientRect on un-laid-out
    // elements; override so the grid believes it has a viewport and
    // visible rows can be enumerated.
    host.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    const pillCols: ColumnDef[] = [
      { id: 'a', width: 100, displayName: 'A' },
      {
        id: 'b',
        width: 200,
        displayName: 'B',
        renderer: {
          id: 'pill',
          mount: () => {
            const el = document.createElement('span');
            el.className = 'pill';
            return el;
          },
          update: (el, ctx) => {
            el.textContent = `cell-${String(ctx.rowIndex)}`;
          },
        },
      },
    ];
    const grid = new Grid({
      host,
      columns: pillCols,
      rowSource: rowSource(50),
      rowHeight: 24,
    });
    // Wait for the rAF tick.
    await new Promise((r) => setTimeout(r, 30));
    const pills = host.querySelectorAll('.pill');
    expect(pills.length).toBeGreaterThan(0);
    expect((pills[0] as HTMLElement).textContent).toMatch(/^cell-\d+$/);
    grid.destroy();
    expect(host.children.length).toBe(0);
    document.body.removeChild(host);
  });

  it('mounts a tooltip element when a column has a tooltip provider', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const cols: ColumnDef[] = [
      { id: 'a', width: 100, displayName: 'A' },
      {
        id: 'b',
        width: 200,
        displayName: 'B',
        tooltip: (v) => `tip:${String(v)}`,
      },
    ];
    const grid = new Grid({
      host,
      columns: cols,
      rowSource: rowSource(50),
      rowHeight: 24,
    });
    const tip = host.querySelector('[role="tooltip"]') as HTMLElement;
    expect(tip).not.toBeNull();
    expect((tip as HTMLElement).style.display).toBe('none'); // hidden by default
    grid.destroy();
    expect(host.querySelector('[role="tooltip"]')).toBeNull();
    document.body.removeChild(host);
  });

  it('does not mount a tooltip element when no column has a tooltip provider', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const grid = new Grid({
      host,
      columns: COLUMNS,
      rowSource: rowSource(50),
      rowHeight: 24,
    });
    expect(host.querySelector('[role="tooltip"]')).toBeNull();
    grid.destroy();
    document.body.removeChild(host);
  });

  it('mounts a custom editor variant when ColumnDef.editor is set', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    host.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    const editorCalls: string[] = [];
    const cols: ColumnDef[] = [
      { id: 'a', width: 100, displayName: 'A' },
      {
        id: 'b',
        width: 200,
        displayName: 'B',
        editor: {
          id: 'test-select',
          mount: (ctx) => {
            const sel = document.createElement('select');
            sel.className = 'test-editor';
            for (const v of ['x', 'y', 'z']) {
              const o = document.createElement('option');
              o.value = v;
              sel.appendChild(o);
            }
            sel.value = String(ctx.value ?? 'x');
            return {
              element: sel,
              getValue: () => sel.value,
              focus: () => {
                editorCalls.push('focus');
                sel.focus();
              },
            };
          },
        },
      },
    ];
    const grid = new Grid({
      host,
      columns: cols,
      rowSource: rowSource(50),
      rowHeight: 24,
      editable: true,
      onCellEdit: (_r, _c, n) => editorCalls.push(`commit:${n}`),
    });
    grid.beginEdit(0, 1);
    const sel = host.querySelector('select.test-editor') as HTMLSelectElement;
    expect(sel).not.toBeNull();
    expect(editorCalls).toContain('focus');
    sel.value = 'y';
    grid.commitEdit();
    expect(editorCalls).toContain('commit:y');
    // Custom editors are torn down on commit (default editor is pooled).
    expect(host.querySelector('select.test-editor')).toBeNull();
    grid.destroy();
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
