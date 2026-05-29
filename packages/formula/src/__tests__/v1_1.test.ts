// =============================================================================
// @onegrid/formula — v1.1.0 function-library expansion tests.
//
// Excel-parity targets per docs/v1.1.0.md Chunk B. Function results are
// cross-checked against Microsoft's public function docs and the
// ECMA-376 §18.17 spec examples where they exist. We do NOT copy
// example strings — every case is paraphrased.
// =============================================================================

import { describe, expect, it } from 'vitest';
import { getFunction } from '../functions';
import { DIV_ZERO, NA_ERROR, NUM_ERROR, VALUE_ERROR } from '../errors';

const call = (name: string, args: unknown[]): unknown => {
  const fn = getFunction(name);
  if (!fn) throw new Error(`function ${name} not registered`);
  return fn(args);
};

// ----------------- Math expansion ----------------------------------------

describe('@onegrid/formula — math expansion', () => {
  it('PRODUCT multiplies the flattened numeric inputs', () => {
    expect(call('PRODUCT', [1, 2, 3, 4])).toBe(24);
    expect(call('PRODUCT', [[2, 3], [4]])).toBe(24);
    expect(call('PRODUCT', [])).toBe(0);
  });

  it('SUMSQ sums the squares', () => {
    expect(call('SUMSQ', [3, 4])).toBe(25);
  });

  it('SUMPRODUCT element-wise then sums', () => {
    expect(call('SUMPRODUCT', [[1, 2, 3], [4, 5, 6]])).toBe(1 * 4 + 2 * 5 + 3 * 6);
  });

  it('SUMPRODUCT mismatched array lengths → VALUE!', () => {
    expect(call('SUMPRODUCT', [[1, 2], [1, 2, 3]])).toBe(VALUE_ERROR);
  });

  it('GCD / LCM', () => {
    expect(call('GCD', [12, 18])).toBe(6);
    expect(call('LCM', [4, 6])).toBe(12);
    expect(call('GCD', [-4, 8])).toBe(NUM_ERROR);
  });

  it('EXP / LN / LOG / LOG10', () => {
    expect(call('EXP', [0])).toBe(1);
    expect(call('LN', [Math.E])).toBeCloseTo(1, 10);
    expect(call('LOG', [100])).toBeCloseTo(2, 10);
    expect(call('LOG', [8, 2])).toBeCloseTo(3, 10);
    expect(call('LOG10', [1000])).toBeCloseTo(3, 10);
    expect(call('LN', [-1])).toBe(NUM_ERROR);
  });

  it('PI / RADIANS / DEGREES', () => {
    expect(call('PI', [])).toBeCloseTo(Math.PI, 12);
    expect(call('RADIANS', [180])).toBeCloseTo(Math.PI, 12);
    expect(call('DEGREES', [Math.PI])).toBeCloseTo(180, 10);
  });

  it('trig + inverse trig + hyperbolic', () => {
    expect(call('SIN', [0])).toBe(0);
    expect(call('COS', [0])).toBe(1);
    expect(call('TAN', [0])).toBe(0);
    expect(call('ASIN', [1])).toBeCloseTo(Math.PI / 2, 12);
    expect(call('ACOS', [1])).toBe(0);
    expect(call('ATAN', [1])).toBeCloseTo(Math.PI / 4, 12);
    expect(call('SINH', [0])).toBe(0);
    expect(call('COSH', [0])).toBe(1);
    expect(call('TANH', [0])).toBe(0);
    expect(call('ASIN', [2])).toBe(NUM_ERROR);
    expect(call('ACOSH', [0.5])).toBe(NUM_ERROR);
  });

  it('ATAN2 — Excel argument order is (x, y), opposite of JS', () => {
    expect(call('ATAN2', [1, 1])).toBeCloseTo(Math.PI / 4, 12);
    expect(call('ATAN2', [0, 0])).toBe(DIV_ZERO);
  });

  it('RAND / RANDBETWEEN', () => {
    const r = call('RAND', []) as number;
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThan(1);
    const rb = call('RANDBETWEEN', [1, 10]) as number;
    expect(rb).toBeGreaterThanOrEqual(1);
    expect(rb).toBeLessThanOrEqual(10);
    expect(Number.isInteger(rb)).toBe(true);
    expect(call('RANDBETWEEN', [5, 1])).toBe(NUM_ERROR);
  });

  it('SIGN / TRUNC', () => {
    expect(call('SIGN', [-5])).toBe(-1);
    expect(call('SIGN', [0])).toBe(0);
    expect(call('SIGN', [7])).toBe(1);
    expect(call('TRUNC', [3.7])).toBe(3);
    expect(call('TRUNC', [-3.7])).toBe(-3);
    expect(call('TRUNC', [3.456, 2])).toBeCloseTo(3.45, 12);
  });

  it('ROUNDDOWN / ROUNDUP / MROUND', () => {
    expect(call('ROUNDDOWN', [3.7])).toBe(3);
    expect(call('ROUNDDOWN', [-3.7])).toBe(-3);
    expect(call('ROUNDUP', [3.2])).toBe(4);
    expect(call('ROUNDUP', [-3.2])).toBe(-4);
    expect(call('MROUND', [10, 3])).toBe(9);
    expect(call('MROUND', [11, 3])).toBe(12);
    expect(call('MROUND', [-10, 3])).toBe(NUM_ERROR);
  });

  it('EVEN / ODD', () => {
    expect(call('EVEN', [1])).toBe(2);
    expect(call('EVEN', [2])).toBe(2);
    expect(call('EVEN', [-3])).toBe(-4);
    expect(call('ODD', [1])).toBe(1);
    expect(call('ODD', [2])).toBe(3);
    expect(call('ODD', [-4])).toBe(-5);
  });

  it('SQRTPI / FACT', () => {
    expect(call('SQRTPI', [1])).toBeCloseTo(Math.sqrt(Math.PI), 12);
    expect(call('FACT', [0])).toBe(1);
    expect(call('FACT', [5])).toBe(120);
    expect(call('FACT', [-1])).toBe(NUM_ERROR);
  });

  it('COMBIN / PERMUT', () => {
    expect(call('COMBIN', [5, 2])).toBe(10);
    expect(call('COMBIN', [10, 0])).toBe(1);
    expect(call('PERMUT', [5, 2])).toBe(20);
    expect(call('COMBIN', [3, 5])).toBe(NUM_ERROR);
  });
});

// ----------------- Stats -------------------------------------------------

describe('@onegrid/formula — stats', () => {
  it('MEDIAN handles odd and even lengths', () => {
    expect(call('MEDIAN', [1, 2, 3])).toBe(2);
    expect(call('MEDIAN', [1, 2, 3, 4])).toBe(2.5);
  });

  it('MODE.SNGL returns the most frequent; #N/A when all unique', () => {
    expect(call('MODE.SNGL', [1, 2, 2, 3])).toBe(2);
    expect(call('MODE.SNGL', [1, 2, 3])).toBe(NA_ERROR);
  });

  it('STDEV.S / VAR.S use n-1; STDEV.P / VAR.P use n', () => {
    // Series [2,4,4,4,5,5,7,9]: mean=5, sum-of-squared-deviations=32.
    // VAR.S = 32 / (8-1) = 32/7;  VAR.P = 32 / 8 = 4.
    const series = [2, 4, 4, 4, 5, 5, 7, 9];
    expect(call('VAR.S', series)).toBeCloseTo(32 / 7, 10);
    expect(call('VAR.P', series)).toBeCloseTo(4, 10);
    expect(call('STDEV.P', series)).toBeCloseTo(2, 10);
  });

  it('LARGE / SMALL return the k-th value', () => {
    expect(call('LARGE', [[3, 1, 4, 1, 5, 9, 2, 6], 2])).toBe(6);
    expect(call('SMALL', [[3, 1, 4, 1, 5, 9, 2, 6], 1])).toBe(1);
    expect(call('LARGE', [[1, 2, 3], 5])).toBe(NUM_ERROR);
  });

  it('RANK.EQ descending by default; ascending with order arg', () => {
    expect(call('RANK.EQ', [3, [1, 2, 3, 4, 5]])).toBe(3); // desc: 3 is 3rd
    expect(call('RANK.EQ', [3, [1, 2, 3, 4, 5], 1])).toBe(3); // asc: 3 is also 3rd
    expect(call('RANK.EQ', [99, [1, 2, 3]])).toBe(NA_ERROR);
  });

  it('PERCENTILE.INC interpolates', () => {
    expect(call('PERCENTILE.INC', [[1, 2, 3, 4], 0.5])).toBeCloseTo(2.5, 10);
    expect(call('PERCENTILE.INC', [[1, 2, 3, 4], 0])).toBe(1);
    expect(call('PERCENTILE.INC', [[1, 2, 3, 4], 1])).toBe(4);
    expect(call('PERCENTILE.INC', [[1, 2, 3, 4], 1.5])).toBe(NUM_ERROR);
  });

  it('QUARTILE.INC maps q=0..4 to percentiles 0/25/50/75/100', () => {
    expect(call('QUARTILE.INC', [[1, 2, 3, 4, 5], 2])).toBeCloseTo(3, 10);
    expect(call('QUARTILE.INC', [[1, 2, 3, 4, 5], 5])).toBe(NUM_ERROR);
  });

  it('CORREL / PEARSON / RSQ', () => {
    expect(call('CORREL', [[1, 2, 3, 4], [2, 4, 6, 8]])).toBeCloseTo(1, 10);
    expect(call('PEARSON', [[1, 2, 3, 4], [4, 3, 2, 1]])).toBeCloseTo(-1, 10);
    expect(call('RSQ', [[1, 2, 3, 4], [2, 4, 6, 8]])).toBeCloseTo(1, 10);
  });

  it('COVARIANCE.S / COVARIANCE.P', () => {
    expect(call('COVARIANCE.S', [[1, 2, 3], [4, 5, 6]])).toBeCloseTo(1, 10);
    expect(call('COVARIANCE.P', [[1, 2, 3], [4, 5, 6]])).toBeCloseTo(2 / 3, 10);
  });

  it('SLOPE / INTERCEPT recover y = mx + b from a line', () => {
    // ys, xs — Excel argument order.
    expect(call('SLOPE', [[3, 5, 7], [1, 2, 3]])).toBeCloseTo(2, 10);
    expect(call('INTERCEPT', [[3, 5, 7], [1, 2, 3]])).toBeCloseTo(1, 10);
  });
});

// ----------------- Conditional aggregates --------------------------------

describe('@onegrid/formula — *IF / *IFS', () => {
  it('COUNTIF with literal and comparison and wildcard criteria', () => {
    expect(call('COUNTIF', [[1, 2, 3, 4, 5], '>2'])).toBe(3);
    expect(call('COUNTIF', [[1, 2, 3, 4, 5], '<>3'])).toBe(4);
    expect(call('COUNTIF', [['apple', 'apricot', 'banana'], 'ap*'])).toBe(2);
    expect(call('COUNTIF', [['x', 'xy', 'xyz'], 'x?'])).toBe(1);
  });

  it('SUMIF / AVERAGEIF with sum_range', () => {
    expect(
      call('SUMIF', [
        ['a', 'b', 'a', 'b'],
        'a',
        [10, 20, 30, 40],
      ]),
    ).toBe(40);
    expect(
      call('AVERAGEIF', [
        ['a', 'b', 'a', 'b'],
        'b',
        [10, 20, 30, 40],
      ]),
    ).toBe(30);
  });

  it('SUMIFS / AVERAGEIFS / COUNTIFS combine predicates with AND', () => {
    const values = [10, 20, 30, 40, 50];
    const region = ['N', 'N', 'S', 'S', 'N'];
    const segment = ['A', 'B', 'A', 'B', 'A'];
    expect(call('SUMIFS', [values, region, 'N', segment, 'A'])).toBe(60);
    expect(call('AVERAGEIFS', [values, region, 'N', segment, 'A'])).toBe(30);
    expect(call('COUNTIFS', [region, 'N', segment, 'A'])).toBe(2);
  });

  it('MAXIFS / MINIFS', () => {
    expect(call('MAXIFS', [[10, 20, 30, 40], ['a', 'b', 'a', 'b'], 'a'])).toBe(30);
    expect(call('MINIFS', [[10, 20, 30, 40], ['a', 'b', 'a', 'b'], 'b'])).toBe(20);
  });
});

// ----------------- Logical extras ---------------------------------------

describe('@onegrid/formula — logical extras', () => {
  it('IFS returns the first truthy branch; #N/A otherwise', () => {
    expect(call('IFS', [false, 'no', true, 'yes'])).toBe('yes');
    expect(call('IFS', [false, 'a', false, 'b'])).toBe(NA_ERROR);
  });

  it('SWITCH matches by value; optional default', () => {
    expect(call('SWITCH', ['b', 'a', 1, 'b', 2, 'c', 3])).toBe(2);
    expect(call('SWITCH', ['z', 'a', 1, 'b', 2, 'fallback'])).toBe('fallback');
    expect(call('SWITCH', ['z', 'a', 1])).toBe(NA_ERROR);
  });

  it('IFNA only catches #N/A (not other errors)', () => {
    expect(call('IFNA', [NA_ERROR, 'caught'])).toBe('caught');
    expect(call('IFNA', [DIV_ZERO, 'caught'])).toBe(DIV_ZERO);
    expect(call('IFNA', [42, 'caught'])).toBe(42);
  });

  it('XOR is odd-parity over truthy inputs', () => {
    expect(call('XOR', [true, false])).toBe(true);
    expect(call('XOR', [true, true])).toBe(false);
    expect(call('XOR', [true, true, true])).toBe(true);
  });
});

// ----------------- Info ---------------------------------------------------

describe('@onegrid/formula — info', () => {
  it('ISNA / ISERR partition the error space', () => {
    expect(call('ISNA', [NA_ERROR])).toBe(true);
    expect(call('ISERR', [NA_ERROR])).toBe(false); // ISERR excludes #N/A
    expect(call('ISERR', [DIV_ZERO])).toBe(true);
  });

  it('ISLOGICAL only true for boolean', () => {
    expect(call('ISLOGICAL', [true])).toBe(true);
    expect(call('ISLOGICAL', [1])).toBe(false);
    expect(call('ISLOGICAL', ['true'])).toBe(false);
  });

  it('ISEVEN / ISODD truncate before parity check', () => {
    expect(call('ISEVEN', [2.5])).toBe(true); // trunc → 2
    expect(call('ISODD', [3.7])).toBe(true); // trunc → 3
  });

  it('N coerces; NA returns the sentinel', () => {
    expect(call('N', [42])).toBe(42);
    expect(call('N', [true])).toBe(1);
    expect(call('N', ['hi'])).toBe(0);
    expect(call('NA', [])).toBe(NA_ERROR);
  });

  it('TYPE returns Excel type codes', () => {
    expect(call('TYPE', [1])).toBe(1);
    expect(call('TYPE', ['x'])).toBe(2);
    expect(call('TYPE', [true])).toBe(4);
    expect(call('TYPE', [NA_ERROR])).toBe(16);
    expect(call('TYPE', [[1, 2]])).toBe(64);
  });

  it('ERROR.TYPE returns Excel error codes', () => {
    expect(call('ERROR.TYPE', [NA_ERROR])).toBe(7);
    expect(call('ERROR.TYPE', [DIV_ZERO])).toBe(2);
    expect(call('ERROR.TYPE', [VALUE_ERROR])).toBe(3);
    expect(call('ERROR.TYPE', [42])).toBe(NA_ERROR);
  });
});
