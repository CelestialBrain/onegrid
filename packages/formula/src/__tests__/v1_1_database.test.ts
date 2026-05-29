// =============================================================================
// @onegrid/formula — v1.1.0 wave 8: database family (D-functions).
//
// Verifies criteria semantics (AND-within-row, OR-across-rows), field
// addressing by both header name and 1-based index, and aggregate parity
// with SUM/AVG/MIN/MAX/COUNT over the filtered slice.
// =============================================================================

import { describe, expect, it } from 'vitest';
import { getFunction } from '../functions';
import { NUM_ERROR, VALUE_ERROR } from '../errors';

const call = (name: string, args: unknown[]): unknown => {
  const fn = getFunction(name);
  if (!fn) throw new Error(`function ${name} not registered`);
  return fn(args);
};

// A small produce table used across the suite.
const DB = [
  ['Tree', 'Height', 'Age', 'Yield', 'Profit'],
  ['Apple', 18, 20, 14, 105],
  ['Pear', 12, 12, 10, 96],
  ['Cherry', 13, 14, 9, 105],
  ['Apple', 14, 15, 10, 75],
  ['Pear', 9, 8, 8, 76.8],
  ['Apple', 8, 9, 6, 45],
];

describe('@onegrid/formula — D-aggregates by header name', () => {
  it('DSUM of Yield where Tree=Apple', () => {
    expect(call('DSUM', [DB, 'Yield', [['Tree'], ['Apple']]])).toBe(14 + 10 + 6);
  });

  it('DAVERAGE of Age where Tree=Pear', () => {
    expect(call('DAVERAGE', [DB, 'Age', [['Tree'], ['Pear']]])).toBe(10);
  });

  it('DMAX / DMIN of Height where Tree=Apple', () => {
    expect(call('DMAX', [DB, 'Height', [['Tree'], ['Apple']]])).toBe(18);
    expect(call('DMIN', [DB, 'Height', [['Tree'], ['Apple']]])).toBe(8);
  });

  it('DCOUNT / DCOUNTA of Tree=Apple', () => {
    expect(call('DCOUNT', [DB, 'Yield', [['Tree'], ['Apple']]])).toBe(3);
    expect(call('DCOUNTA', [DB, 'Tree', [['Tree'], ['Apple']]])).toBe(3);
  });

  it('DPRODUCT of Yield where Tree=Apple', () => {
    expect(call('DPRODUCT', [DB, 'Yield', [['Tree'], ['Apple']]])).toBe(14 * 10 * 6);
  });
});

describe('@onegrid/formula — D-aggregates by column index', () => {
  it('DSUM with field=4 (Yield)', () => {
    expect(call('DSUM', [DB, 4, [['Tree'], ['Apple']]])).toBe(30);
  });

  it('out-of-range field is #VALUE!', () => {
    expect(call('DSUM', [DB, 99, [['Tree'], ['Apple']]])).toBe(VALUE_ERROR);
  });
});

describe('@onegrid/formula — criteria semantics', () => {
  it('AND within a row: Tree=Apple AND Height>=10', () => {
    const crit = [
      ['Tree', 'Height'],
      ['Apple', '>=10'],
    ];
    // Matches Apple/18 and Apple/14.
    expect(call('DSUM', [DB, 'Yield', crit])).toBe(14 + 10);
  });

  it('OR across rows: Tree=Apple OR Tree=Pear', () => {
    const crit = [['Tree'], ['Apple'], ['Pear']];
    expect(call('DCOUNT', [DB, 'Yield', crit])).toBe(5);
  });

  it('comparison criterion: Age>10', () => {
    const crit = [['Age'], ['>10']];
    // Apple/20, Pear/12, Cherry/14, Apple/15
    expect(call('DCOUNT', [DB, 'Yield', crit])).toBe(4);
  });

  it('empty criterion cell is ignored', () => {
    const crit = [
      ['Tree', 'Age'],
      ['Apple', ''],
    ];
    expect(call('DCOUNT', [DB, 'Yield', crit])).toBe(3);
  });
});

describe('@onegrid/formula — DSTDEV/DVAR', () => {
  it('DVAR sample variance of Yield where Tree=Apple', () => {
    // values: 14, 10, 6 → mean 10, var = ((4)²+0²+(-4)²)/2 = 16
    expect(call('DVAR', [DB, 'Yield', [['Tree'], ['Apple']]])).toBeCloseTo(16, 8);
  });

  it('DVARP population variance', () => {
    // 32/3
    expect(call('DVARP', [DB, 'Yield', [['Tree'], ['Apple']]]) as number).toBeCloseTo(32 / 3, 8);
  });

  it('DSTDEV / DSTDEVP', () => {
    expect(call('DSTDEV', [DB, 'Yield', [['Tree'], ['Apple']]]) as number).toBeCloseTo(4, 8);
    expect(call('DSTDEVP', [DB, 'Yield', [['Tree'], ['Apple']]]) as number).toBeCloseTo(
      Math.sqrt(32 / 3),
      8,
    );
  });
});

describe('@onegrid/formula — DGET', () => {
  it('returns the single match', () => {
    const crit = [['Tree'], ['Cherry']];
    expect(call('DGET', [DB, 'Yield', crit])).toBe(9);
  });

  it('no match is #VALUE!', () => {
    expect(call('DGET', [DB, 'Yield', [['Tree'], ['Walnut']]])).toBe(VALUE_ERROR);
  });

  it('multiple matches is #NUM!', () => {
    expect(call('DGET', [DB, 'Yield', [['Tree'], ['Apple']]])).toBe(NUM_ERROR);
  });
});
