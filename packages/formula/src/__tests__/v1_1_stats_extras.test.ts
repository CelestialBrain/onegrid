// =============================================================================
// @onegrid/formula — v1.1.0 wave 11: stats extras.
// =============================================================================

import { describe, expect, it } from 'vitest';
import { getFunction } from '../functions';
import { NUM_ERROR } from '../errors';

const call = (name: string, args: unknown[]): unknown => {
  const fn = getFunction(name);
  if (!fn) throw new Error(`function ${name} not registered`);
  return fn(args);
};

describe('@onegrid/formula — descriptive statistics', () => {
  it('GEOMEAN of [1,2,4,8] = 2.828...', () => {
    expect(call('GEOMEAN', [1, 2, 4, 8]) as number).toBeCloseTo(Math.pow(64, 1 / 4), 8);
  });

  it('HARMEAN of [1,2,4] = 12/7', () => {
    expect(call('HARMEAN', [1, 2, 4]) as number).toBeCloseTo(12 / 7, 8);
  });

  it('GEOMEAN rejects non-positive', () => {
    expect(call('GEOMEAN', [1, -2])).toBe(NUM_ERROR);
  });

  it('TRIMMEAN removes extremes', () => {
    // 10 values, 20% trim → drop 1 from each end → mean of middle 8.
    expect(call('TRIMMEAN', [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.2])).toBe(5.5);
  });

  it('DEVSQ = (n-1) * sample variance', () => {
    expect(call('DEVSQ', [1, 2, 3, 4, 5])).toBe(10);
  });

  it('AVEDEV', () => {
    expect(call('AVEDEV', [1, 2, 3, 4, 5])).toBeCloseTo(1.2, 8);
  });

  it('MODE.MULT returns all modes', () => {
    expect(call('MODE.MULT', [1, 2, 2, 3, 3, 4])).toEqual([[2], [3]]);
  });
});

describe('@onegrid/formula — PROB / FREQUENCY', () => {
  it('PROB sums matching probabilities', () => {
    expect(call('PROB', [[1, 2, 3, 4], [0.1, 0.2, 0.3, 0.4], 2, 3])).toBeCloseTo(0.5, 8);
  });

  it('PROB rejects probabilities not summing to 1', () => {
    expect(call('PROB', [[1, 2], [0.3, 0.3], 1, 2])).toBe(NUM_ERROR);
  });

  it('FREQUENCY bins values', () => {
    const r = call('FREQUENCY', [[1, 2, 3, 4, 5, 6], [2, 4]]) as number[][];
    expect(r).toEqual([[2], [2], [2]]);
  });
});

describe('@onegrid/formula — confidence', () => {
  it('CONFIDENCE.NORM ≈ z * sigma / sqrt(n)', () => {
    // alpha=0.05 → z=1.96; sigma=10, n=100 → 1.96
    expect(call('CONFIDENCE.NORM', [0.05, 10, 100]) as number).toBeCloseTo(1.96, 2);
  });

  it('CONFIDENCE.T uses Student t', () => {
    const v = call('CONFIDENCE.T', [0.05, 10, 100]) as number;
    // Slightly larger than CONFIDENCE.NORM for same params.
    expect(v).toBeGreaterThan(1.96);
    expect(v).toBeLessThan(2.2);
  });
});

describe('@onegrid/formula — hypothesis tests', () => {
  it('Z.TEST returns p-value', () => {
    const p = call('Z.TEST', [[3, 6, 7, 8, 6, 5], 4]) as number;
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
  });

  it('T.TEST paired vs independent', () => {
    const a = [3, 4, 5, 8, 9];
    const b = [1, 2, 4, 5, 7];
    const paired = call('T.TEST', [a, b, 2, 1]) as number;
    const indep = call('T.TEST', [a, b, 2, 2]) as number;
    expect(paired).toBeGreaterThan(0);
    expect(paired).toBeLessThan(1);
    expect(indep).toBeGreaterThan(0);
    expect(indep).toBeLessThan(1);
  });

  it('F.TEST returns two-tailed p-value', () => {
    const p = call('F.TEST', [[6, 7, 9, 15, 21], [20, 28, 31, 38, 40]]) as number;
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
  });

  it('CHISQ.TEST: identical obs vs exp → p=1', () => {
    const t = [[10, 20], [30, 40]];
    expect(call('CHISQ.TEST', [t, t]) as number).toBeCloseTo(1, 6);
  });
});

describe('@onegrid/formula — regression', () => {
  it('LINEST recovers y = 2x + 1', () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = xs.map((x) => 2 * x + 1);
    const r = call('LINEST', [ys, xs]) as number[][];
    expect(r[0]![0]).toBeCloseTo(2, 8);
    expect(r[0]![1]).toBeCloseTo(1, 8);
  });

  it('LOGEST recovers y = 3 * 2^x', () => {
    const xs = [1, 2, 3, 4];
    const ys = xs.map((x) => 3 * Math.pow(2, x));
    const r = call('LOGEST', [ys, xs]) as number[][];
    expect(r[0]![0]).toBeCloseTo(2, 6);
    expect(r[0]![1]).toBeCloseTo(3, 6);
  });

  it('GROWTH predicts y for new x', () => {
    const xs = [1, 2, 3, 4];
    const ys = xs.map((x) => 3 * Math.pow(2, x));
    const r = call('GROWTH', [ys, xs, [5, 6]]) as number[][];
    expect(r[0]![0]).toBeCloseTo(3 * 32, 4);
    expect(r[1]![0]).toBeCloseTo(3 * 64, 4);
  });
});
