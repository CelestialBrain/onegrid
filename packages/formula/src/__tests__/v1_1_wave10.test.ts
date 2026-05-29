// =============================================================================
// @onegrid/formula — v1.1.0 wave 10: math extras + matrix + array-shape +
// stubs.
// =============================================================================

import { describe, expect, it } from 'vitest';
import { getFunction } from '../functions';
import { NA_ERROR, NAME_ERROR, NUM_ERROR, VALUE_ERROR } from '../errors';

const call = (name: string, args: unknown[]): unknown => {
  const fn = getFunction(name);
  if (!fn) throw new Error(`function ${name} not registered`);
  return fn(args);
};

describe('@onegrid/formula — math extras', () => {
  it('QUOTIENT trunc-divide', () => {
    expect(call('QUOTIENT', [7, 2])).toBe(3);
    expect(call('QUOTIENT', [-7, 2])).toBe(-3);
    expect(call('QUOTIENT', [1, 0])).toBe(NUM_ERROR);
  });

  it('FACTDOUBLE: 7!! = 105, 6!! = 48', () => {
    expect(call('FACTDOUBLE', [7])).toBe(105);
    expect(call('FACTDOUBLE', [6])).toBe(48);
    expect(call('FACTDOUBLE', [0])).toBe(1);
    expect(call('FACTDOUBLE', [-1])).toBe(NUM_ERROR);
  });

  it('MULTINOMIAL: (2+3+4)! / (2!3!4!) = 1260', () => {
    expect(call('MULTINOMIAL', [2, 3, 4])).toBe(1260);
  });

  it('SERIESSUM: 1 + x + x² + x³ at x=2 = 15', () => {
    expect(call('SERIESSUM', [2, 0, 1, [1, 1, 1, 1]])).toBe(15);
  });

  it('SUMX2MY2 / SUMX2PY2 / SUMXMY2', () => {
    expect(call('SUMX2MY2', [[3, 4], [1, 2]])).toBe(9 - 1 + 16 - 4);
    expect(call('SUMX2PY2', [[3, 4], [1, 2]])).toBe(9 + 1 + 16 + 4);
    expect(call('SUMXMY2', [[3, 4], [1, 2]])).toBe(4 + 4);
  });

  it('ROMAN / ARABIC round-trip', () => {
    expect(call('ROMAN', [1994])).toBe('MCMXCIV');
    expect(call('ARABIC', ['MCMXCIV'])).toBe(1994);
    expect(call('ARABIC', [call('ROMAN', [499])])).toBe(499);
  });

  it('BASE / DECIMAL round-trip', () => {
    expect(call('BASE', [255, 16])).toBe('FF');
    expect(call('BASE', [7, 2, 8])).toBe('00000111');
    expect(call('DECIMAL', ['FF', 16])).toBe(255);
    expect(call('DECIMAL', ['ZZ', 36])).toBe(36 * 36 - 1);
  });

  it('RANDARRAY default 1x1 returns scalar number', () => {
    const v = call('RANDARRAY', []) as number;
    expect(typeof v).toBe('number');
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });

  it('RANDARRAY whole_number', () => {
    const g = call('RANDARRAY', [2, 3, 0, 9, true]) as number[][];
    expect(g.length).toBe(2);
    expect(g[0]!.length).toBe(3);
    for (const row of g) for (const v of row) expect(Number.isInteger(v)).toBe(true);
  });
});

describe('@onegrid/formula — matrix', () => {
  it('TRANSPOSE', () => {
    expect(call('TRANSPOSE', [[[1, 2, 3], [4, 5, 6]]])).toEqual([
      [1, 4],
      [2, 5],
      [3, 6],
    ]);
  });

  it('MUNIT', () => {
    expect(call('MUNIT', [3])).toEqual([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
  });

  it('MMULT identity', () => {
    const m = [[1, 2], [3, 4]];
    const I = [[1, 0], [0, 1]];
    expect(call('MMULT', [m, I])).toEqual(m);
  });

  it('MMULT 2x3 · 3x2 = 2x2', () => {
    expect(
      call('MMULT', [
        [[1, 2, 3], [4, 5, 6]],
        [[7, 8], [9, 10], [11, 12]],
      ]),
    ).toEqual([
      [58, 64],
      [139, 154],
    ]);
  });

  it('MDETERM of 2x2', () => {
    expect(call('MDETERM', [[[1, 2], [3, 4]]])).toBeCloseTo(-2, 10);
  });

  it('MDETERM of singular = 0', () => {
    expect(call('MDETERM', [[[1, 2], [2, 4]]])).toBe(0);
  });

  it('MINVERSE · M = I', () => {
    const m = [[4, 3], [6, 3]];
    const inv = call('MINVERSE', [m]) as number[][];
    const prod = call('MMULT', [m, inv]) as number[][];
    expect(prod[0]![0]).toBeCloseTo(1, 8);
    expect(prod[0]![1]).toBeCloseTo(0, 8);
    expect(prod[1]![0]).toBeCloseTo(0, 8);
    expect(prod[1]![1]).toBeCloseTo(1, 8);
  });

  it('MINVERSE singular is #NUM!', () => {
    expect(call('MINVERSE', [[[1, 2], [2, 4]]])).toBe(NUM_ERROR);
  });
});

describe('@onegrid/formula — array shape', () => {
  const a = [
    [1, 2, 3],
    [4, 5, 6],
  ];

  it('TOROW / TOCOL', () => {
    expect(call('TOROW', [a])).toEqual([[1, 2, 3, 4, 5, 6]]);
    expect(call('TOCOL', [a])).toEqual([[1], [4], [2], [5], [3], [6]]);
  });

  it('WRAPROWS pads with #N/A', () => {
    const r = call('WRAPROWS', [[1, 2, 3, 4, 5], 3]) as unknown[][];
    expect(r[0]).toEqual([1, 2, 3]);
    expect(r[1]).toEqual([4, 5, NA_ERROR]);
  });

  it('WRAPROWS custom pad', () => {
    expect(call('WRAPROWS', [[1, 2, 3, 4, 5], 3, 0])).toEqual([
      [1, 2, 3],
      [4, 5, 0],
    ]);
  });

  it('TAKE positive and negative', () => {
    expect(call('TAKE', [a, 1])).toEqual([[1, 2, 3]]);
    expect(call('TAKE', [a, -1])).toEqual([[4, 5, 6]]);
    expect(call('TAKE', [a, 2, 2])).toEqual([
      [1, 2],
      [4, 5],
    ]);
  });

  it('DROP', () => {
    expect(call('DROP', [a, 1])).toEqual([[4, 5, 6]]);
    expect(call('DROP', [a, 0, -1])).toEqual([
      [1, 2],
      [4, 5],
    ]);
  });

  it('CHOOSEROWS / CHOOSECOLS', () => {
    expect(call('CHOOSEROWS', [a, 2])).toEqual([[4, 5, 6]]);
    expect(call('CHOOSECOLS', [a, 3, 1])).toEqual([
      [3, 1],
      [6, 4],
    ]);
  });

  it('CHOOSEROWS negative index', () => {
    expect(call('CHOOSEROWS', [a, -1])).toEqual([[4, 5, 6]]);
  });

  it('EXPAND with default #N/A pad', () => {
    const r = call('EXPAND', [[[1]], 2, 2]) as unknown[][];
    expect(r[0]).toEqual([1, NA_ERROR]);
    expect(r[1]).toEqual([NA_ERROR, NA_ERROR]);
  });

  it('EXPAND smaller-than-source is #NUM!', () => {
    expect(call('EXPAND', [a, 1, 1])).toBe(NUM_ERROR);
  });

  it('HSTACK / VSTACK', () => {
    expect(call('HSTACK', [[[1], [2]], [[3], [4]]])).toEqual([
      [1, 3],
      [2, 4],
    ]);
    expect(call('VSTACK', [[[1, 2]], [[3, 4]]])).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });
});

describe('@onegrid/formula — stubs', () => {
  it('CELL / INFO / SHEET / SHEETS are #NAME!', () => {
    for (const n of ['CELL', 'INFO', 'SHEET', 'SHEETS', 'FORMULATEXT', 'GETPIVOTDATA', 'AREAS', 'BAHTTEXT']) {
      expect(call(n, [])).toBe(NAME_ERROR);
    }
  });

  it('ISFORMULA / ISREF default false', () => {
    expect(call('ISFORMULA', ['A1'])).toBe(false);
    expect(call('ISREF', ['A1'])).toBe(false);
  });

  it('VALUETOTEXT format 0/1', () => {
    expect(call('VALUETOTEXT', ['hello'])).toBe('hello');
    expect(call('VALUETOTEXT', ['hello', 1])).toBe('"hello"');
    expect(call('VALUETOTEXT', [true])).toBe('TRUE');
  });

  it('ARRAYTOTEXT format 0/1', () => {
    expect(call('ARRAYTOTEXT', [[[1, 2], [3, 4]]])).toBe('1, 2, 3, 4');
    expect(call('ARRAYTOTEXT', [[[1, 2], [3, 4]], 1])).toBe('{1,2;3,4}');
  });
});
