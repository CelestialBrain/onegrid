import { describe, it, expect, vi } from 'vitest';
import { Database } from '../index.js';

describe('Database', () => {
  it('starts at revision 0', () => {
    const db = new Database();
    expect(db.currentRevision).toBe(0);
  });

  it('bumps revision when an input changes', () => {
    const db = new Database();
    const x = db.defineInput('x', 1);
    x.set(2);
    expect(db.currentRevision).toBe(1);
    x.set(3);
    expect(db.currentRevision).toBe(2);
  });

  it('does NOT bump revision when an input is set to its current value', () => {
    const db = new Database();
    const x = db.defineInput('x', 1);
    x.set(1);
    expect(db.currentRevision).toBe(0);
  });

  it('rejects duplicate input keys', () => {
    const db = new Database();
    db.defineInput('x', 1);
    expect(() => db.defineInput('x', 2)).toThrow(/OG_REACTIVE_DUPLICATE_INPUT/);
  });
});

describe('Tracked queries', () => {
  it('runs compute once and caches', () => {
    const db = new Database();
    const x = db.defineInput('x', 5);
    const computeImpl = vi.fn();
    const square = db.defineQuery<undefined, number>('square', () => {
      computeImpl();
      const v = x.get();
      return v * v;
    });
    expect(square(undefined)).toBe(25);
    expect(square(undefined)).toBe(25);
    expect(computeImpl).toHaveBeenCalledTimes(1);
  });

  it('re-runs when a dep input changes', () => {
    const db = new Database();
    const x = db.defineInput('x', 5);
    const computeImpl = vi.fn();
    const square = db.defineQuery<undefined, number>('square', () => {
      computeImpl();
      return x.get() * x.get();
    });
    expect(square(undefined)).toBe(25);
    x.set(6);
    expect(square(undefined)).toBe(36);
    expect(computeImpl).toHaveBeenCalledTimes(2);
  });

  it('skips recompute when an unrelated input changes', () => {
    const db = new Database();
    const x = db.defineInput('x', 5);
    const y = db.defineInput('y', 100);
    const computeImpl = vi.fn();
    const square = db.defineQuery<undefined, number>('square', () => {
      computeImpl();
      return x.get() * x.get();
    });
    square(undefined);
    y.set(200); // not a dep of square
    square(undefined);
    expect(computeImpl).toHaveBeenCalledTimes(1);
  });

  it('memoizes per-args independently', () => {
    const db = new Database();
    const computeImpl = vi.fn();
    const ident = db.defineQuery<number, number>('ident', (_, n) => {
      computeImpl();
      return n;
    });
    expect(ident(1)).toBe(1);
    expect(ident(2)).toBe(2);
    expect(ident(1)).toBe(1); // hit
    expect(ident(2)).toBe(2); // hit
    expect(computeImpl).toHaveBeenCalledTimes(2);
  });
});

describe('Backdating', () => {
  it('keeps the cached reference when recompute produces an equal value', () => {
    const db = new Database();
    const x = db.defineInput('x', 5);
    const computeImpl = vi.fn();
    const constish = db.defineQuery<undefined, number>('constish', () => {
      computeImpl();
      const v = x.get();
      return Math.abs(v); // both 5 and -5 produce 5
    });
    expect(constish(undefined)).toBe(5);
    x.set(-5);
    expect(constish(undefined)).toBe(5);
    expect(computeImpl).toHaveBeenCalledTimes(2);
    // computedAt for the second run was BACKDATED to the first run's
    // computedAt, which means a downstream query depending on constish
    // would not re-run on this input change.
    const downstreamImpl = vi.fn();
    const downstream = db.defineQuery<undefined, number>('downstream', () => {
      downstreamImpl();
      return constish(undefined) + 1;
    });
    expect(downstream(undefined)).toBe(6);
    x.set(5); // bumps revision, but constish backdates back to 5
    expect(downstream(undefined)).toBe(6);
    // downstream should have computed exactly once — the backdating
    // protected it from the cascade.
    expect(downstreamImpl).toHaveBeenCalledTimes(1);
  });
});

describe('Custom equality', () => {
  it('uses caller-supplied eq for inputs', () => {
    const db = new Database();
    const x = db.defineInput<{ id: number }>(
      'x',
      { id: 1 },
      (a, b) => a.id === b.id,
    );
    x.set({ id: 1 }); // structurally equal — should NOT bump revision
    expect(db.currentRevision).toBe(0);
    x.set({ id: 2 });
    expect(db.currentRevision).toBe(1);
  });
});
