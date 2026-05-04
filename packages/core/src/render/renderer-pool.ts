// =============================================================================
// RendererPool
//
// Object pool for custom cell renderer DOM instances, keyed by renderer
// id. Acquire returns a free instance (or calls mount() to make a fresh
// one if the pool is empty for that id); release puts it back, calling
// reset() to clear focus/state. The pool is sized organically — it never
// throws away instances, just keeps them around for reuse.
//
// Why pooled mounts instead of mount-per-cell-per-frame:
//   - Framework reactivity (React fiber, Svelte runes, Solid signals,
//     Vue reactivity refs) is expensive to re-create. Pooling lets a
//     React component survive multiple scroll-in/scroll-out cycles.
//   - Allocation pressure. At 60fps with 100 visible custom cells, a
//     fresh mount per frame is 6,000 allocations/sec. The GC will
//     stutter long before that.
//
// Pool grows monotonically. In practice the cap is the *peak* visible
// count for that renderer type, which equals
//   ceil(viewportHeight / minRowHeight) × columnsWithThisRenderer.
// For typical UIs that's 50-200 instances per renderer type.
// =============================================================================

import type { CellRenderContext, CellRenderer } from '../types';

interface PooledInstance {
  readonly el: HTMLElement;
  /** Last cell coordinates this instance rendered, for smarter reuse. */
  lastRow: number;
  lastCol: number;
}

export class RendererPool {
  private readonly free = new Map<string, PooledInstance[]>();
  private readonly inUse = new Map<string, PooledInstance[]>();
  private readonly host: HTMLElement;

  constructor(host: HTMLElement) {
    this.host = host;
  }

  /** Pop a free instance for the given renderer (or mount a new one).
   *  Returns the wrapper so the caller can update lastRow/lastCol after
   *  positioning. */
  acquire(renderer: CellRenderer, context: CellRenderContext): PooledInstance {
    const freeList = this.free.get(renderer.id);
    let instance = freeList?.pop();
    if (!instance) {
      const el = renderer.mount(context);
      this.host.appendChild(el);
      instance = { el, lastRow: -1, lastCol: -1 };
    }
    let inUseList = this.inUse.get(renderer.id);
    if (!inUseList) {
      inUseList = [];
      this.inUse.set(renderer.id, inUseList);
    }
    inUseList.push(instance);
    instance.lastRow = context.rowIndex;
    instance.lastCol = -1; // caller fills after column index resolved
    return instance;
  }

  /** Return all in-use instances back to the free pool, optionally
   *  excluding ones still claimed for the current frame. The renderer's
   *  reset() runs on each instance going back to free. */
  releaseUnclaimed(
    rendererId: string,
    claimed: ReadonlySet<HTMLElement>,
    reset?: (el: HTMLElement) => void,
  ): void {
    const inUseList = this.inUse.get(rendererId);
    if (!inUseList) return;
    let freeList = this.free.get(rendererId);
    if (!freeList) {
      freeList = [];
      this.free.set(rendererId, freeList);
    }
    const stillUsed: PooledInstance[] = [];
    for (const inst of inUseList) {
      if (claimed.has(inst.el)) {
        stillUsed.push(inst);
      } else {
        if (reset) reset(inst.el);
        inst.el.style.display = 'none';
        freeList.push(inst);
      }
    }
    this.inUse.set(rendererId, stillUsed);
  }

  /** Number of pooled (free + in-use) instances for a renderer.
   *  Useful for tests. */
  size(rendererId: string): number {
    return (
      (this.free.get(rendererId)?.length ?? 0) +
      (this.inUse.get(rendererId)?.length ?? 0)
    );
  }

  /** Tear down: detach all elements from the host and drop the pool. */
  destroy(): void {
    for (const list of this.free.values()) {
      for (const inst of list) inst.el.remove();
    }
    for (const list of this.inUse.values()) {
      for (const inst of list) inst.el.remove();
    }
    this.free.clear();
    this.inUse.clear();
  }
}
