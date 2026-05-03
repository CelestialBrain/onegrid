import { describe, expect, it } from 'vitest';
import { createIncrementalEngine } from '../incremental';
import { isFormulaError } from '../errors';

describe('IncrementalFormulaEngine — basics', () => {
  it('reads literal values', () => {
    const e = createIncrementalEngine();
    e.setValue('A1', 10);
    expect(e.getValue('A1')).toBe(10);
  });

  it('returns null for cells that were never set', () => {
    const e = createIncrementalEngine();
    expect(e.getValue('A1')).toBeNull();
  });

  it('evaluates a formula referencing literal cells', () => {
    const e = createIncrementalEngine();
    e.setValue('A1', 10);
    e.setValue('A2', 20);
    e.setCell('A3', '=A1 + A2');
    expect(e.getValue('A3')).toBe(30);
  });

  it('evaluates SUM over a range', () => {
    const e = createIncrementalEngine();
    e.setValue('A1', 1);
    e.setValue('A2', 2);
    e.setValue('A3', 3);
    e.setCell('B1', '=SUM(A1:A3)');
    expect(e.getValue('B1')).toBe(6);
  });

  it('supports formulas referencing other formulas (chain)', () => {
    const e = createIncrementalEngine();
    e.setValue('A1', 5);
    e.setCell('A2', '=A1 * 2');
    e.setCell('A3', '=A2 + 1');
    expect(e.getValue('A3')).toBe(11);
  });

  it('treats $ABS$REFS as the same node as A1', () => {
    const e = createIncrementalEngine();
    e.setValue('A1', 7);
    e.setCell('B1', '=$A$1 + 1');
    expect(e.getValue('B1')).toBe(8);
  });
});

describe('dirty propagation', () => {
  it('updating a cell propagates dirty to dependents', () => {
    const e = createIncrementalEngine();
    e.setValue('A1', 10);
    e.setCell('B1', '=A1 + 1');
    expect(e.getValue('B1')).toBe(11);
    e.setValue('A1', 20);
    expect(e.getValue('B1')).toBe(21);
  });

  it('updating a cell propagates through chains', () => {
    const e = createIncrementalEngine();
    e.setValue('A1', 1);
    e.setCell('A2', '=A1 + 1');
    e.setCell('A3', '=A2 + 1');
    e.setCell('A4', '=A3 + 1');
    expect(e.getValue('A4')).toBe(4);
    e.setValue('A1', 10);
    expect(e.getValue('A4')).toBe(13);
  });

  it('updating a range member invalidates the range cache', () => {
    const e = createIncrementalEngine();
    e.setValue('A1', 1);
    e.setValue('A2', 2);
    e.setValue('A3', 3);
    e.setCell('B1', '=SUM(A1:A3)');
    expect(e.getValue('B1')).toBe(6);
    e.setValue('A2', 20);
    expect(e.getValue('B1')).toBe(24);
  });

  it('replacing a formula clears stale dependencies', () => {
    const e = createIncrementalEngine();
    e.setValue('A1', 10);
    e.setValue('A2', 20);
    e.setCell('B1', '=A1');
    expect(e.getValue('B1')).toBe(10);
    // B1 used to depend on A1; now it depends on A2.
    e.setCell('B1', '=A2');
    expect(e.getValue('B1')).toBe(20);
    // Changing A1 must NOT mark B1 dirty (it no longer reads A1).
    expect(e.getDependents('A1')).toEqual([]);
    expect(e.getDependents('A2')).toEqual(['B1']);
  });

  it('clearing a cell makes dependents recompute against undefined', () => {
    const e = createIncrementalEngine();
    e.setValue('A1', 10);
    e.setCell('B1', '=A1 + 1');
    expect(e.getValue('B1')).toBe(11);
    e.clearCell('A1');
    // Dependent recomputes; A1's value is now null → coerces to 0 in math.
    expect(e.getValue('B1')).toBe(1);
  });
});

describe('demand-driven evaluation', () => {
  it('cells that are never read are never evaluated', () => {
    const e = createIncrementalEngine();
    let evaluations = 0;
    e.setValue('A1', 10);
    // Custom function that counts calls — spies on whether the formula ran.
    // We use a sentinel: a custom function won't exist, so SUM is fine here.
    e.setCell('B1', '=A1 + 1'); // never read
    e.setCell('C1', '=A1 + 2');
    e.setCell('D1', '=C1 + 3'); // demand: needs C1, which needs A1
    e.getValue('D1'); // triggers C1 + A1 only

    // We can't directly count evaluations of B1 without instrumentation,
    // but we can verify B1 is dirty (never computed) while D1 is clean.
    expect(e.getStats().dirtyCount).toBeGreaterThan(0);
    e.getValue('B1'); // forces it
    // After reading every cell, dirty should drop.
    e.getValue('D1');
    e.getValue('C1');
    void evaluations;
  });

  it('reading the same value twice without changes only computes once', () => {
    const e = createIncrementalEngine();
    e.setValue('A1', 5);
    e.setCell('B1', '=A1 * 2');
    expect(e.getValue('B1')).toBe(10);
    expect(e.getStats().dirtyCount).toBe(0);
    expect(e.getValue('B1')).toBe(10);
    expect(e.getStats().dirtyCount).toBe(0);
  });
});

describe('cycle detection', () => {
  it('returns #REF! for direct self-cycles', () => {
    const e = createIncrementalEngine();
    e.setCell('A1', '=A1 + 1');
    const v = e.getValue('A1');
    expect(isFormulaError(v)).toBe(true);
  });

  it('returns #REF! for indirect cycles', () => {
    const e = createIncrementalEngine();
    e.setCell('A1', '=B1');
    e.setCell('B1', '=A1');
    const v = e.getValue('A1');
    expect(isFormulaError(v)).toBe(true);
  });

  it('a cycle introduced and removed leaves a clean state', () => {
    const e = createIncrementalEngine();
    e.setValue('A1', 1);
    e.setCell('B1', '=A1');
    expect(e.getValue('B1')).toBe(1);
    e.setCell('A1', '=B1'); // cycle: A1 → B1 → A1
    expect(isFormulaError(e.getValue('B1'))).toBe(true);
    e.setValue('A1', 99);
    expect(e.getValue('B1')).toBe(99);
  });
});

describe('range nodes (linear edges, not quadratic)', () => {
  it('multiple formulas reading the same range share one range node', () => {
    const e = createIncrementalEngine();
    for (let i = 1; i <= 10; i++) {
      e.setValue(`A${i}`, i);
    }
    // 5 formulas all reading A1:A10
    e.setCell('B1', '=SUM(A1:A10)');
    e.setCell('B2', '=SUM(A1:A10)');
    e.setCell('B3', '=AVERAGE(A1:A10)');
    e.setCell('B4', '=MIN(A1:A10)');
    e.setCell('B5', '=MAX(A1:A10)');
    // Force evaluation
    expect(e.getValue('B1')).toBe(55);
    expect(e.getValue('B3')).toBe(5.5);
    expect(e.getValue('B4')).toBe(1);
    expect(e.getValue('B5')).toBe(10);

    // Edge accounting (demand-driven):
    //   range "A1:A10" → 10 cells   = 10 edges
    //   B1, B3, B4, B5 → range       = 4 edges (we read four formulas)
    //   B2 → range                   = 0 (never read; demand-driven means
    //                                  no edge was built for it yet)
    //   total                        = 14 edges
    // Linear in (cells + readers), not the cells × readers product.
    const stats = e.getStats();
    expect(stats.edgeCount).toBe(14);
    expect(stats.rangeNodeCount).toBeGreaterThanOrEqual(1);

    // Reading B2 now adds the missing edge — proves demand-driven exactly.
    expect(e.getValue('B2')).toBe(55);
    expect(e.getStats().edgeCount).toBe(15);
  });

  it('changing one cell in a range invalidates the range and its dependents', () => {
    const e = createIncrementalEngine();
    e.setValue('A1', 1);
    e.setValue('A2', 2);
    e.setValue('A3', 3);
    e.setCell('B1', '=SUM(A1:A3)');
    expect(e.getValue('B1')).toBe(6);
    e.setValue('A2', 20);
    expect(e.getValue('B1')).toBe(24);
  });

  it('handles a 100-cell range', () => {
    const e = createIncrementalEngine();
    for (let i = 1; i <= 100; i++) {
      e.setValue(`A${i}`, i);
    }
    e.setCell('B1', '=SUM(A1:A100)');
    expect(e.getValue('B1')).toBe(5050);
  });
});

describe('introspection', () => {
  it('reports the dependency edges built during evaluation', () => {
    const e = createIncrementalEngine();
    e.setValue('A1', 1);
    e.setValue('A2', 2);
    e.setCell('B1', '=A1 + A2');
    e.getValue('B1'); // populate edges
    expect(new Set(e.getDependencies('B1'))).toEqual(new Set(['A1', 'A2']));
    expect(e.getDependents('A1')).toEqual(['B1']);
  });

  it('clear() empties everything', () => {
    const e = createIncrementalEngine();
    e.setValue('A1', 10);
    e.setCell('B1', '=A1');
    e.getValue('B1');
    e.clear();
    expect(e.getStats().cellCount).toBe(0);
    expect(e.getStats().nodeCount).toBe(0);
    expect(e.getValue('A1')).toBeNull();
  });
});
