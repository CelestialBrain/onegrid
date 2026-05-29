// =============================================================================
// @onegrid/formula — v1.1.0 wave 3: text-family expansion.
// =============================================================================

import { describe, expect, it } from 'vitest';
import { getFunction } from '../functions';
import { NA_ERROR, VALUE_ERROR } from '../errors';

const call = (name: string, args: unknown[]): unknown => {
  const fn = getFunction(name);
  if (!fn) throw new Error(`function ${name} not registered`);
  return fn(args);
};

describe('@onegrid/formula — VALUE / NUMBERVALUE', () => {
  it('VALUE parses plain numbers, currency, percent, thousands', () => {
    expect(call('VALUE', ['1234'])).toBe(1234);
    expect(call('VALUE', ['$1,234.50'])).toBe(1234.5);
    expect(call('VALUE', ['50%'])).toBe(0.5);
    expect(call('VALUE', ['+42'])).toBe(42);
    expect(call('VALUE', ['nope'])).toBe(VALUE_ERROR);
  });

  it('NUMBERVALUE honors custom decimal/group separators', () => {
    expect(call('NUMBERVALUE', ['1.234,5', ',', '.'])).toBeCloseTo(1234.5, 10);
    expect(call('NUMBERVALUE', ['1 234,5', ',', ' '])).toBeCloseTo(1234.5, 10);
    expect(call('NUMBERVALUE', ['25%%', '.', ','])).toBeCloseTo(0.0025, 10);
  });
});

describe('@onegrid/formula — TEXT', () => {
  it('TEXT integer / fixed-decimal padding', () => {
    expect(call('TEXT', [42, '0'])).toBe('42');
    expect(call('TEXT', [42.5, '0.00'])).toBe('42.50');
  });

  it('TEXT thousands separator', () => {
    expect(call('TEXT', [1234567, '#,##0'])).toBe('1,234,567');
    expect(call('TEXT', [1234.5, '#,##0.00'])).toBe('1,234.50');
  });

  it('TEXT percent', () => {
    expect(call('TEXT', [0.5, '0%'])).toBe('50%');
    expect(call('TEXT', [0.125, '0.00%'])).toBe('12.50%');
  });

  it('TEXT date formats', () => {
    const d = new Date(2026, 4, 29); // 2026-05-29 (months are 0-indexed in JS)
    expect(call('TEXT', [d, 'yyyy-mm-dd'])).toBe('2026-05-29');
    expect(call('TEXT', [d, 'm/d/yyyy'])).toBe('5/29/2026');
  });
});

describe('@onegrid/formula — DOLLAR / FIXED', () => {
  it('DOLLAR default 2 decimals + thousands + leading sign', () => {
    expect(call('DOLLAR', [1234.5])).toBe('$1,234.50');
    expect(call('DOLLAR', [1234.5, 0])).toBe('$1,235');
    expect(call('DOLLAR', [-1234.5])).toBe('-$1,234.50');
  });

  it('FIXED with no-commas flag', () => {
    expect(call('FIXED', [1234.5])).toBe('1,234.50');
    expect(call('FIXED', [1234.5, 1, true])).toBe('1234.5');
    expect(call('FIXED', [-1234.5])).toBe('-1,234.50');
  });
});

describe('@onegrid/formula — REPT / REPLACE', () => {
  it('REPT repeats; rejects negative count + 32k cap', () => {
    expect(call('REPT', ['ab', 3])).toBe('ababab');
    expect(call('REPT', ['x', 0])).toBe('');
    expect(call('REPT', ['x', -1])).toBe(VALUE_ERROR);
    expect(call('REPT', ['xx', 20_000])).toBe(VALUE_ERROR); // would exceed 32767
  });

  it('REPLACE swaps a range with new text', () => {
    expect(call('REPLACE', ['hello world', 7, 5, 'there'])).toBe('hello there');
    expect(call('REPLACE', ['abcdef', 2, 2, 'XYZ'])).toBe('aXYZdef');
  });
});

describe('@onegrid/formula — SEARCH', () => {
  it('SEARCH is case-insensitive (vs FIND which is case-sensitive)', () => {
    expect(call('SEARCH', ['WORLD', 'hello world'])).toBe(7);
    expect(call('SEARCH', ['xyz', 'hello world'])).toBe(VALUE_ERROR);
  });

  it('SEARCH honors start-position', () => {
    expect(call('SEARCH', ['o', 'hello world', 6])).toBe(8);
  });

  it('SEARCH supports * / ? wildcards', () => {
    expect(call('SEARCH', ['w?rld', 'hello world'])).toBe(7);
    expect(call('SEARCH', ['*wor*', 'hello world'])).toBe(1); // wildcard mode anchors
  });
});

describe('@onegrid/formula — CLEAN / EXACT / PROPER / CHAR / CODE', () => {
  it('CLEAN strips ASCII control chars', () => {
    expect(call('CLEAN', ['abcdefghi'])).toBe('abcdefghi');
  });

  it('EXACT is case-sensitive equality', () => {
    expect(call('EXACT', ['abc', 'abc'])).toBe(true);
    expect(call('EXACT', ['abc', 'ABC'])).toBe(false);
  });

  it('PROPER title-cases boundary letters', () => {
    expect(call('PROPER', ['hello world'])).toBe('Hello World');
    expect(call('PROPER', ['THIS IS LOUD'])).toBe('This Is Loud');
    expect(call('PROPER', ["it's a test"])).toBe("It'S A Test"); // Excel-parity quirk
  });

  it('CHAR / UNICHAR codepoint round-trip', () => {
    expect(call('CHAR', [65])).toBe('A');
    expect(call('CHAR', [9731])).toBe('☃');
    expect(call('CHAR', [0])).toBe(VALUE_ERROR);
    expect(call('UNICHAR', [9731])).toBe('☃');
  });

  it('CODE / UNICODE return the first-char code', () => {
    expect(call('CODE', ['A'])).toBe(65);
    expect(call('UNICODE', ['☃'])).toBe(9731);
    expect(call('CODE', [''])).toBe(VALUE_ERROR);
  });
});

describe('@onegrid/formula — T', () => {
  it('T returns the string if input is text, else empty', () => {
    expect(call('T', ['hello'])).toBe('hello');
    expect(call('T', [42])).toBe('');
    expect(call('T', [true])).toBe('');
  });
});

describe('@onegrid/formula — TEXTJOIN / TEXTSPLIT', () => {
  it('TEXTJOIN with ignore_empty toggle', () => {
    expect(call('TEXTJOIN', [', ', true, 'a', '', 'b', null, 'c'])).toBe('a, b, c');
    expect(call('TEXTJOIN', [', ', false, 'a', '', 'b'])).toBe('a, , b');
  });

  it('TEXTJOIN flattens array args', () => {
    expect(call('TEXTJOIN', [',', true, ['a', 'b', 'c']])).toBe('a,b,c');
  });

  it('TEXTSPLIT with col delim only → 1xN', () => {
    expect(call('TEXTSPLIT', ['a,b,c', ','])).toEqual([['a', 'b', 'c']]);
  });

  it('TEXTSPLIT with both delims → 2D grid', () => {
    expect(call('TEXTSPLIT', ['a,b;c,d', ',', ';'])).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('TEXTSPLIT ignore_empty drops blank segments', () => {
    expect(call('TEXTSPLIT', [',a,,b,', ',', null, true])).toEqual([['a', 'b']]);
  });
});

describe('@onegrid/formula — TEXTBEFORE / TEXTAFTER', () => {
  it('TEXTBEFORE / TEXTAFTER on first-instance default', () => {
    expect(call('TEXTBEFORE', ['hello.world.txt', '.'])).toBe('hello');
    expect(call('TEXTAFTER', ['hello.world.txt', '.'])).toBe('world.txt');
  });

  it('TEXTBEFORE with instance N picks the Nth occurrence', () => {
    expect(call('TEXTBEFORE', ['a-b-c-d', '-', 2])).toBe('a-b');
    expect(call('TEXTAFTER', ['a-b-c-d', '-', 2])).toBe('c-d');
  });

  it('TEXTBEFORE with negative instance counts from the end', () => {
    expect(call('TEXTBEFORE', ['a-b-c-d', '-', -1])).toBe('a-b-c');
    expect(call('TEXTAFTER', ['a-b-c-d', '-', -1])).toBe('d');
  });

  it('TEXTBEFORE returns if_not_found when delim absent', () => {
    expect(call('TEXTBEFORE', ['abc', 'x'])).toBe(NA_ERROR);
    expect(call('TEXTBEFORE', ['abc', 'x', 1, 0, 0, 'none'])).toBe('none');
  });

  it('match_mode 1 = case-insensitive', () => {
    expect(call('TEXTBEFORE', ['hello WORLD test', 'world', 1, 1])).toBe('hello ');
  });
});
