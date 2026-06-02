// =============================================================================
// Loading / no-rows overlay (wave 24).
//
// Verifies that the Grid mounts an overlay element, shows it when loading
// or when numRows === 0, and routes through adopter-supplied loadingOverlay
// / noRowsOverlay hooks when provided.
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

function findOverlay(host: HTMLElement): HTMLElement | null {
  for (const child of Array.from(host.children)) {
    const el = child as HTMLElement;
    if (el.getAttribute('role') === 'status') return el;
  }
  return null;
}

describe('Wave 24 — Loading / no-rows overlay', () => {
  it('mounts an overlay element with role="status"', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const grid = new Grid({ host, columns: COLUMNS, rowSource: source(100), rowHeight: 24 });
    const overlay = findOverlay(host);
    expect(overlay).not.toBeNull();
    expect(overlay?.getAttribute('aria-live')).toBe('polite');
    grid.destroy();
    document.body.removeChild(host);
  });

  it('hides overlay when numRows > 0 and not loading', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const grid = new Grid({ host, columns: COLUMNS, rowSource: source(10), rowHeight: 24 });
    await new Promise((r) => setTimeout(r, 5));
    const overlay = findOverlay(host)!;
    expect(overlay.style.display).toBe('none');
    grid.destroy();
    document.body.removeChild(host);
  });

  it('shows no-rows overlay when numRows === 0', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const grid = new Grid({ host, columns: COLUMNS, rowSource: source(0), rowHeight: 24 });
    await new Promise((r) => setTimeout(r, 5));
    const overlay = findOverlay(host)!;
    expect(overlay.style.display).toBe('flex');
    expect(overlay.textContent).toContain('No rows');
    grid.destroy();
    document.body.removeChild(host);
  });

  it('shows loading overlay when loading=true (even with rows)', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const grid = new Grid({
      host,
      columns: COLUMNS,
      rowSource: source(10),
      rowHeight: 24,
      loading: true,
    });
    await new Promise((r) => setTimeout(r, 5));
    const overlay = findOverlay(host)!;
    expect(overlay.style.display).toBe('flex');
    expect(overlay.textContent).toContain('Loading');
    grid.destroy();
    document.body.removeChild(host);
  });

  it('setLoading toggles between modes', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const grid = new Grid({ host, columns: COLUMNS, rowSource: source(5), rowHeight: 24 });
    await new Promise((r) => setTimeout(r, 5));
    const overlay = findOverlay(host)!;
    expect(overlay.style.display).toBe('none');
    grid.setLoading(true);
    await new Promise((r) => setTimeout(r, 5));
    expect(overlay.style.display).toBe('flex');
    expect(overlay.textContent).toContain('Loading');
    grid.setLoading(false);
    await new Promise((r) => setTimeout(r, 5));
    expect(overlay.style.display).toBe('none');
    grid.destroy();
    document.body.removeChild(host);
  });

  it('routes through adopter loadingOverlay hook when provided', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const hook = vi.fn((el: HTMLElement) => {
      const custom = document.createElement('div');
      custom.dataset.custom = 'yes';
      custom.textContent = 'Custom loader';
      el.appendChild(custom);
    });
    const grid = new Grid({
      host,
      columns: COLUMNS,
      rowSource: source(10),
      rowHeight: 24,
      loading: true,
      loadingOverlay: hook,
    });
    await new Promise((r) => setTimeout(r, 5));
    const overlay = findOverlay(host)!;
    expect(hook).toHaveBeenCalled();
    expect(overlay.querySelector('[data-custom]')?.textContent).toBe('Custom loader');
    grid.destroy();
    document.body.removeChild(host);
  });

  it('routes through adopter noRowsOverlay hook when provided', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const hook = vi.fn((el: HTMLElement) => {
      const custom = document.createElement('div');
      custom.dataset.empty = 'yes';
      custom.textContent = 'Nothing here yet';
      el.appendChild(custom);
    });
    const grid = new Grid({
      host,
      columns: COLUMNS,
      rowSource: source(0),
      rowHeight: 24,
      noRowsOverlay: hook,
    });
    await new Promise((r) => setTimeout(r, 5));
    const overlay = findOverlay(host)!;
    expect(hook).toHaveBeenCalled();
    expect(overlay.querySelector('[data-empty]')?.textContent).toBe('Nothing here yet');
    grid.destroy();
    document.body.removeChild(host);
  });
});
