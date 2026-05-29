// =============================================================================
// @onegrid/formula — v1.1.0 wave 2: lookup / reference family.
// =============================================================================

import { describe, expect, it } from 'vitest';
import { getFunction } from '../functions';
import { NA_ERROR, NAME_ERROR, NUM_ERROR, REF_ERROR, VALUE_ERROR } from '../errors';

const call = (name: string, args: unknown[]): unknown => {
  const fn = getFunction(name);
  if (!fn) throw new Error(`function ${name} not registered`);
  return fn(args);
};

// 2D table fixtures used across several tests.
const PRICE_TABLE: unknown[][] = [
  [1, 'apple', 0.5],
  [2, 'banana', 0.25],
  [3, 'cherry', 1.5],
  [4, 'date', 2.0],
];

describe('@onegrid/formula — VLOOKUP / HLOOKUP / LOOKUP', () => {
  it('VLOOKUP exact match returns the indexed column', () => {
    expect(call('VLOOKUP', [3, PRICE_TABLE, 2, false])).toBe('cherry');
    expect(call('VLOOKUP', [3, PRICE_TABLE, 3, false])).toBe(1.5);
  });

  it('VLOOKUP exact match #N/A when not found', () => {
    expect(call('VLOOKUP', [99, PRICE_TABLE, 2, false])).toBe(NA_ERROR);
  });

  it('VLOOKUP approximate match picks largest ≤ target', () => {
    expect(call('VLOOKUP', [2.7, PRICE_TABLE, 2])).toBe('banana'); // ≤ 2.7 is 2 → banana
    expect(call('VLOOKUP', [0.5, PRICE_TABLE, 2])).toBe(NA_ERROR); // smallest entry is 1
  });

  it('VLOOKUP rejects bad column index', () => {
    expect(call('VLOOKUP', [3, PRICE_TABLE, 10, false])).toBe(REF_ERROR);
    expect(call('VLOOKUP', [3, PRICE_TABLE, 0, false])).toBe(VALUE_ERROR);
  });

  it('HLOOKUP works on the top-row search vector', () => {
    const table: unknown[][] = [
      ['Q1', 'Q2', 'Q3', 'Q4'],
      [100, 200, 300, 400],
    ];
    expect(call('HLOOKUP', ['Q3', table, 2, false])).toBe(300);
    expect(call('HLOOKUP', ['Q5', table, 2, false])).toBe(NA_ERROR);
  });

  it('LOOKUP vector form with explicit result vector', () => {
    expect(call('LOOKUP', [3, [1, 2, 3, 4, 5], ['a', 'b', 'c', 'd', 'e']])).toBe('c');
    expect(call('LOOKUP', [2.7, [1, 2, 3, 4, 5], ['a', 'b', 'c', 'd', 'e']])).toBe('b');
  });
});

describe('@onegrid/formula — MATCH / XMATCH / XLOOKUP', () => {
  it('MATCH exact (matchType 0)', () => {
    expect(call('MATCH', ['banana', ['apple', 'banana', 'cherry'], 0])).toBe(2);
    expect(call('MATCH', ['nope', ['apple', 'banana', 'cherry'], 0])).toBe(NA_ERROR);
  });

  it('MATCH approximate ascending (matchType 1)', () => {
    expect(call('MATCH', [3.5, [1, 2, 3, 4, 5], 1])).toBe(3);
  });

  it('XMATCH wildcard (matchMode 2)', () => {
    expect(call('XMATCH', ['ap*', ['apple', 'banana', 'apricot'], 2])).toBe(1);
    expect(call('XMATCH', ['*na*', ['apple', 'banana', 'cherry'], 2])).toBe(2);
  });

  it('XLOOKUP exact match with separate return vector', () => {
    expect(
      call('XLOOKUP', [
        'banana',
        ['apple', 'banana', 'cherry'],
        [10, 20, 30],
      ]),
    ).toBe(20);
  });

  it('XLOOKUP not found returns if_not_found arg (or #N/A)', () => {
    expect(call('XLOOKUP', ['mango', ['apple', 'banana'], [1, 2]])).toBe(NA_ERROR);
    expect(call('XLOOKUP', ['mango', ['apple', 'banana'], [1, 2], 'fallback'])).toBe('fallback');
  });

  it('XLOOKUP approximate-larger (matchMode 1) and approximate-smaller (-1)', () => {
    const lookup = [1, 2, 3, 4, 5];
    const ret = ['a', 'b', 'c', 'd', 'e'];
    expect(call('XLOOKUP', [2.5, lookup, ret, NA_ERROR, 1])).toBe('c'); // smallest ≥ 2.5 = 3 → 'c'
    expect(call('XLOOKUP', [2.5, lookup, ret, NA_ERROR, -1])).toBe('b'); // largest ≤ 2.5 = 2 → 'b'
  });

  it('XLOOKUP reverse search (searchMode -1) finds last match', () => {
    expect(
      call('XLOOKUP', ['a', ['a', 'b', 'a', 'c'], [1, 2, 3, 4], NA_ERROR, 0, -1]),
    ).toBe(3);
  });
});

describe('@onegrid/formula — INDEX / CHOOSE / ROW / COLUMN', () => {
  it('INDEX 2D with explicit row + col', () => {
    expect(call('INDEX', [PRICE_TABLE, 2, 2])).toBe('banana');
  });

  it('INDEX with row=0 returns whole column', () => {
    expect(call('INDEX', [PRICE_TABLE, 0, 2])).toEqual(['apple', 'banana', 'cherry', 'date']);
  });

  it('INDEX with col=0 returns whole row', () => {
    expect(call('INDEX', [PRICE_TABLE, 1, 0])).toEqual([1, 'apple', 0.5]);
  });

  it('INDEX out-of-range → #REF!', () => {
    expect(call('INDEX', [PRICE_TABLE, 100, 1])).toBe(REF_ERROR);
    expect(call('INDEX', [PRICE_TABLE, 1, 100])).toBe(REF_ERROR);
  });

  it('CHOOSE selects by 1-based index', () => {
    expect(call('CHOOSE', [2, 'a', 'b', 'c'])).toBe('b');
    expect(call('CHOOSE', [4, 'a', 'b', 'c'])).toBe(VALUE_ERROR);
  });

  it('ROW / COLUMN are best-effort 1 in function-call layer', () => {
    expect(call('ROW', [])).toBe(1);
    expect(call('COLUMN', [])).toBe(1);
  });

  it('ROWS / COLUMNS measure arrays', () => {
    expect(call('ROWS', [PRICE_TABLE])).toBe(4);
    expect(call('COLUMNS', [PRICE_TABLE])).toBe(3);
    expect(call('ROWS', [[1, 2, 3, 4, 5]])).toBe(5);
    expect(call('COLUMNS', [[1, 2, 3]])).toBe(1); // 1D is treated as a column
  });

  it('OFFSET / INDIRECT report #NAME! at function layer (needs evaluator wiring)', () => {
    expect(call('OFFSET', ['A1', 1, 1])).toBe(NAME_ERROR);
    expect(call('INDIRECT', ['A1'])).toBe(NAME_ERROR);
  });
});

describe('@onegrid/formula — ADDRESS', () => {
  it('A1 style with absolute / relative refs', () => {
    expect(call('ADDRESS', [1, 1])).toBe('$A$1');
    expect(call('ADDRESS', [1, 1, 2])).toBe('A$1');
    expect(call('ADDRESS', [1, 1, 3])).toBe('$A1');
    expect(call('ADDRESS', [1, 1, 4])).toBe('A1');
  });

  it('beyond Z (col 27 = AA, col 702 = ZZ)', () => {
    expect(call('ADDRESS', [1, 27, 4])).toBe('AA1');
    expect(call('ADDRESS', [1, 702, 4])).toBe('ZZ1');
  });

  it('rejects invalid coords', () => {
    expect(call('ADDRESS', [0, 1])).toBe(VALUE_ERROR);
    expect(call('ADDRESS', [1, 0])).toBe(VALUE_ERROR);
  });
});

describe('@onegrid/formula — FILTER / SORT / SORTBY / UNIQUE / SEQUENCE', () => {
  it('FILTER keeps rows where include is truthy', () => {
    const data: unknown[][] = [['a', 1], ['b', 2], ['c', 3]];
    expect(call('FILTER', [data, [true, false, true]])).toEqual([['a', 1], ['c', 3]]);
  });

  it('FILTER empty result returns if_empty arg', () => {
    expect(call('FILTER', [[1, 2, 3], [false, false, false], 'none'])).toBe('none');
  });

  it('SORT 2D by column index, ascending default', () => {
    const data: unknown[][] = [[3, 'c'], [1, 'a'], [2, 'b']];
    expect(call('SORT', [data, 1])).toEqual([[1, 'a'], [2, 'b'], [3, 'c']]);
  });

  it('SORT descending with order=-1', () => {
    expect(call('SORT', [[3, 1, 2], 1, -1])).toEqual([[3], [2], [1]]);
  });

  it('SORTBY with multiple keys', () => {
    const data: unknown[][] = [['a'], ['b'], ['c']];
    const k1 = [2, 1, 2];
    const k2 = [9, 5, 1];
    // Sort by k1 asc then k2 asc.
    expect(call('SORTBY', [data, k1, 1, k2, 1])).toEqual([['b'], ['c'], ['a']]);
  });

  it('UNIQUE deduplicates rows', () => {
    expect(call('UNIQUE', [[1, 2, 1, 3, 2, 4]])).toEqual([[1], [2], [3], [4]]);
    const dup: unknown[][] = [['a', 1], ['b', 2], ['a', 1], ['c', 3]];
    expect(call('UNIQUE', [dup])).toEqual([['a', 1], ['b', 2], ['c', 3]]);
  });

  it('SEQUENCE generates row x col grid', () => {
    expect(call('SEQUENCE', [3])).toEqual([[1], [2], [3]]);
    expect(call('SEQUENCE', [2, 3])).toEqual([[1, 2, 3], [4, 5, 6]]);
    expect(call('SEQUENCE', [2, 2, 10, 5])).toEqual([[10, 15], [20, 25]]);
    expect(call('SEQUENCE', [0, 1])).toBe(NUM_ERROR);
  });
});
