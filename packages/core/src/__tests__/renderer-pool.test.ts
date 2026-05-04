import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RendererPool } from '../render/renderer-pool';
import type { CellRenderer } from '../types';

const renderer: CellRenderer = {
  id: 'pill',
  mount: () => {
    const el = document.createElement('span');
    el.className = 'pill';
    return el;
  },
  update: (el, ctx) => {
    el.textContent = String(ctx.value);
  },
  reset: (el) => {
    el.textContent = '';
  },
};

describe('RendererPool', () => {
  let host: HTMLElement;
  let pool: RendererPool;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    pool = new RendererPool(host);
  });

  afterEach(() => {
    pool.destroy();
    host.remove();
  });

  it('mounts a fresh element on first acquire and appends to host', () => {
    const ctx = { value: 'a', rowIndex: 0, columnId: 'x' };
    pool.acquire(renderer, ctx);
    expect(host.querySelectorAll('.pill')).toHaveLength(1);
    expect(pool.size('pill')).toBe(1);
  });

  it('reuses pooled instances after releaseUnclaimed', () => {
    const a = pool.acquire(renderer, { value: 'a', rowIndex: 0, columnId: 'x' });
    pool.releaseUnclaimed('pill', new Set(), renderer.reset);
    expect(host.querySelectorAll('.pill')).toHaveLength(1);
    const b = pool.acquire(renderer, { value: 'b', rowIndex: 1, columnId: 'x' });
    expect(b.el).toBe(a.el); // reused the same DOM node
    expect(host.querySelectorAll('.pill')).toHaveLength(1);
  });

  it('keeps claimed instances in use and only resets unclaimed', () => {
    const a = pool.acquire(renderer, { value: 'a', rowIndex: 0, columnId: 'x' });
    const b = pool.acquire(renderer, { value: 'b', rowIndex: 1, columnId: 'x' });
    a.el.textContent = 'A';
    b.el.textContent = 'B';
    // Mark only `a` as claimed for the next frame.
    pool.releaseUnclaimed('pill', new Set([a.el]), renderer.reset);
    expect(a.el.textContent).toBe('A'); // still claimed
    expect(b.el.textContent).toBe(''); // reset
    expect(b.el.style.display).toBe('none');
  });

  it('grows the pool as needed when acquires exceed releases', () => {
    pool.acquire(renderer, { value: 0, rowIndex: 0, columnId: 'x' });
    pool.acquire(renderer, { value: 1, rowIndex: 1, columnId: 'x' });
    pool.acquire(renderer, { value: 2, rowIndex: 2, columnId: 'x' });
    expect(pool.size('pill')).toBe(3);
  });

  it('destroy() removes all instances from the host', () => {
    pool.acquire(renderer, { value: 0, rowIndex: 0, columnId: 'x' });
    pool.acquire(renderer, { value: 1, rowIndex: 1, columnId: 'x' });
    expect(host.querySelectorAll('.pill')).toHaveLength(2);
    pool.destroy();
    expect(host.querySelectorAll('.pill')).toHaveLength(0);
  });
});
