import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HeadlessGrid, createHeadlessGrid } from '../index.js';
import type { GridOptions } from '@onegrid/core';

// jsdom canvas stub — minimum surface Grid needs to mount/destroy.
function installCanvasStub(): void {
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

beforeEach(() => {
  installCanvasStub();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function makeRowSource(rowCount = 100): GridOptions['rowSource'] {
  return {
    readBlock: (startRow: number, blockSize: number) => ({
      rows: Array.from({ length: blockSize }, (_, i) => [
        startRow + i,
        `name-${startRow + i}`,
      ]),
      totalRowCount: rowCount,
    }),
  } as unknown as GridOptions['rowSource'];
}

function makeHost(): HTMLElement {
  // Minimal stub; Grid mounts a canvas and shadow but tolerates the
  // missing DOM in jsdom for the limited surface we exercise.
  const host = document.createElement('div');
  document.body.appendChild(host);
  return host;
}

describe('HeadlessGrid lifecycle', () => {
  beforeEach(() => {
    installCanvasStub();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      return setTimeout(() => cb(performance.now()), 0) as unknown as number;
    });
    vi.stubGlobal('cancelAnimationFrame', (h: number) => {
      clearTimeout(h as unknown as ReturnType<typeof setTimeout>);
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mounts and unmounts via hostConnected/hostDisconnected', () => {
    const host = makeHost();
    const grid = new HeadlessGrid({
      options: {
        host,
        columns: [
          { id: 'id', width: 80 },
          { id: 'name', width: 200 },
        ],
        rowSource: makeRowSource(),
        rowHeight: 32,
      },
    });
    const mount = vi.fn();
    const unmount = vi.fn();
    grid.subscribe('mount', mount);
    grid.subscribe('unmount', unmount);
    grid.hostConnected();
    expect(mount).toHaveBeenCalled();
    expect(grid.core).not.toBeNull();
    grid.hostDisconnected();
    expect(unmount).toHaveBeenCalled();
    expect(grid.core).toBeNull();
  });

  it('hostConnected is idempotent', () => {
    const host = makeHost();
    const grid = new HeadlessGrid({
      options: {
        host,
        columns: [{ id: 'a', width: 100 }],
        rowSource: makeRowSource(10),
        rowHeight: 32,
      },
    });
    const mount = vi.fn();
    grid.subscribe('mount', mount);
    grid.hostConnected();
    grid.hostConnected();
    expect(mount).toHaveBeenCalledTimes(1);
    grid.hostDisconnected();
  });
});

describe('requestUpdate coalescing', () => {
  it('coalesces multiple requestUpdate calls within one rAF tick', () => {
    const host = makeHost();
    const queue: Array<() => void> = [];
    const grid = new HeadlessGrid(
      {
        options: {
          host,
          columns: [{ id: 'a', width: 100 }],
          rowSource: makeRowSource(10),
          rowHeight: 32,
        },
      },
      {
        raf: (cb) => {
          queue.push(cb);
          return queue.length;
        },
        cancel: () => {},
      },
    );
    const invalidate = vi.fn();
    grid.subscribe('invalidate', invalidate);
    grid.hostConnected();
    grid.requestUpdate('sort');
    grid.requestUpdate('filter');
    grid.requestUpdate('sort');
    expect(queue).toHaveLength(1);
    queue[0]!();
    expect(invalidate).toHaveBeenCalledTimes(1);
    const reasons = invalidate.mock.calls[0]![0]!.reason as string;
    expect(reasons).toContain('sort');
    expect(reasons).toContain('filter');
    grid.hostDisconnected();
  });

  it('does nothing when called before mount', () => {
    const host = makeHost();
    const queue: Array<() => void> = [];
    const grid = new HeadlessGrid(
      {
        options: {
          host,
          columns: [{ id: 'a', width: 100 }],
          rowSource: makeRowSource(10),
          rowHeight: 32,
        },
      },
      {
        raf: (cb) => {
          queue.push(cb);
          return queue.length;
        },
        cancel: () => {},
      },
    );
    grid.requestUpdate('preMount');
    expect(queue).toHaveLength(0);
  });
});

describe('Imperative surface', () => {
  beforeEach(() => {
    installCanvasStub();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      return setTimeout(() => cb(performance.now()), 0) as unknown as number;
    });
    vi.stubGlobal('cancelAnimationFrame', (h: number) => {
      clearTimeout(h as unknown as ReturnType<typeof setTimeout>);
    });
  });

  it('setSort fires sortChange and schedules invalidation', () => {
    const host = makeHost();
    const grid = createHeadlessGrid({
      options: {
        host,
        columns: [{ id: 'a', width: 100 }],
        rowSource: makeRowSource(10),
        rowHeight: 32,
      },
    });
    const sortChange = vi.fn();
    grid.subscribe('sortChange', sortChange);
    grid.hostConnected();
    grid.setSort([{ columnId: 'a', direction: 'asc' }]);
    expect(sortChange).toHaveBeenCalledWith([{ columnId: 'a', direction: 'asc' }]);
    grid.hostDisconnected();
  });

  it('setFilter surfaces the change without touching Grid', () => {
    const host = makeHost();
    const grid = createHeadlessGrid({
      options: {
        host,
        columns: [{ id: 'a', width: 100 }],
        rowSource: makeRowSource(10),
        rowHeight: 32,
      },
    });
    const filterChange = vi.fn();
    grid.subscribe('filterChange', filterChange);
    grid.hostConnected();
    grid.setFilter({ type: 'comparison', columnId: 'a', op: 'eq', value: 1 });
    expect(filterChange).toHaveBeenCalled();
    grid.hostDisconnected();
  });

  it('subscribe returns an unsubscribe function', () => {
    const host = makeHost();
    const grid = createHeadlessGrid({
      options: {
        host,
        columns: [{ id: 'a', width: 100 }],
        rowSource: makeRowSource(10),
        rowHeight: 32,
      },
    });
    const fn = vi.fn();
    const off = grid.subscribe('mount', fn);
    off();
    grid.hostConnected();
    expect(fn).not.toHaveBeenCalled();
    grid.hostDisconnected();
  });
});

describe('SSR shadow HTML', () => {
  it('renders role=grid with header + sample rows from rowSource', () => {
    const host = makeHost();
    const grid = createHeadlessGrid({
      options: {
        host,
        columns: [
          { id: 'id', width: 80, displayName: 'ID' },
          { id: 'name', width: 200, displayName: 'Name' },
        ],
        rowSource: makeRowSource(50),
        rowHeight: 32,
      },
    });
    const html = grid.renderAccessibilityShadowHTML();
    expect(html).toContain('role="grid"');
    expect(html).toContain('aria-rowcount="50"');
    expect(html).toContain('aria-colcount="2"');
    expect(html).toContain('role="columnheader"');
    expect(html).toContain('aria-colindex="1"');
    expect(html).toContain('role="row"');
    expect(html).toContain('role="gridcell"');
    expect(html).toContain('name-0');
    expect(html).toContain('data-og-ssr="true"');
  });

  it('escapes HTML in cell values', () => {
    const host = makeHost();
    const rs = {
      readBlock: () => ({
        rows: [['<script>alert(1)</script>']],
        totalRowCount: 1,
      }),
    } as unknown as GridOptions['rowSource'];
    const grid = createHeadlessGrid({
      options: {
        host,
        columns: [{ id: 'x', width: 100 }],
        rowSource: rs,
        rowHeight: 32,
      },
    });
    const html = grid.renderAccessibilityShadowHTML();
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
