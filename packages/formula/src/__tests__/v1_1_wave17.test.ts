// =============================================================================
// @onegrid/formula — v1.1.0 wave 17: dynamic-array spilling.
//
// `#` spilled-range operator, `@` implicit-intersection, `#SPILL!` error
// code, and the SpillTracker registry that adopters wire into the resolver
// via `getSpill`.
// =============================================================================

import { describe, expect, it } from 'vitest';
import {
  createFormulaEngine,
  SPILL_ERROR,
  SpillTracker,
  asSpilled,
  checkSpillCollision,
} from '..';
import type { CellResolver } from '../evaluator';

const cells: Record<string, unknown> = { A1: 10, A2: 20, A3: 30, B1: 100, B2: 200 };
const ranges: Record<string, ReadonlyArray<unknown>> = {
  'A1:A3': [10, 20, 30],
  'A1:B2': [10, 20, 100, 200],
};

const tracker = new SpillTracker();
tracker.record('D1', [[1, 2, 3]]); // spilled row: D1, E1, F1 → 1, 2, 3
tracker.record('E1', [[100], [200], [300]]); // spilled column: E1, E2, E3

const resolver: CellResolver = {
  getCell: (ref) => cells[ref] ?? null,
  getRange: (ref) => ranges[ref] ?? [],
  getSpill: (anchor) => tracker.lookup(anchor)?.values,
};
const engine = createFormulaEngine();
const ev = (input: string): unknown => engine.evaluate(input, resolver);

describe('@onegrid/formula — wave 17 — spilled-range operator (`#`)', () => {
  it('D1# returns the recorded spill row', () => {
    expect(ev('=D1#')).toEqual([[1, 2, 3]]);
  });
  it('E1# returns the recorded spill column', () => {
    expect(ev('=E1#')).toEqual([[100], [200], [300]]);
  });
  it('SUM(D1#) aggregates the spill', () => {
    expect(ev('=SUM(D1#)')).toBe(6);
  });
  it('unanchored ref → #REF!', () => {
    const r = ev('=Z99#') as { code?: string };
    expect(r?.code).toBe('#REF!');
  });
});

describe('@onegrid/formula — wave 17 — implicit-intersection operator (`@`)', () => {
  it('@A1:A3 collapses range to its first element', () => {
    expect(ev('=@A1:A3')).toBe(10);
  });
  it('@D1# collapses a spilled array to its first element', () => {
    expect(ev('=@D1#')).toBe(1);
  });
  it('@scalar returns the scalar unchanged', () => {
    expect(ev('=@42')).toBe(42);
  });
});

describe('@onegrid/formula — wave 17 — SpillTracker', () => {
  it('record + lookup round-trip', () => {
    const t = new SpillTracker();
    t.record('A1', [[1, 2], [3, 4]]);
    expect(t.lookup('A1')?.extent).toEqual({ rows: 2, cols: 2 });
    expect(t.lookup('A1')?.values).toEqual([[1, 2], [3, 4]]);
  });
  it('clear removes a record', () => {
    const t = new SpillTracker();
    t.record('A1', [[1]]);
    t.clear('A1');
    expect(t.lookup('A1')).toBeUndefined();
  });
});

describe('@onegrid/formula — wave 17 — collision detection', () => {
  it('checkSpillCollision returns null when target range is clear', () => {
    const r = checkSpillCollision('A1', { rows: 3, cols: 1 }, () => false);
    expect(r).toBeNull();
  });
  it('checkSpillCollision returns #SPILL! when a target cell is occupied', () => {
    const r = checkSpillCollision('A1', { rows: 3, cols: 1 }, (ref) => ref === 'A2');
    expect(r).toBe(SPILL_ERROR);
  });
  it('checkSpillCollision ignores the anchor itself', () => {
    const r = checkSpillCollision('A1', { rows: 1, cols: 1 }, (ref) => ref === 'A1');
    expect(r).toBeNull();
  });
});

describe('@onegrid/formula — wave 17 — asSpilled normalization', () => {
  it('scalar → null (no spill)', () => {
    expect(asSpilled(42)).toBeNull();
  });
  it('1D array → column vector', () => {
    expect(asSpilled([1, 2, 3])).toEqual([[1], [2], [3]]);
  });
  it('2D array → passthrough', () => {
    expect(asSpilled([[1, 2], [3, 4]])).toEqual([[1, 2], [3, 4]]);
  });
});
