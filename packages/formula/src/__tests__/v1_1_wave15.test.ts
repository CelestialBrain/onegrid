// =============================================================================
// @onegrid/formula — v1.1.0 wave 15: parser/evaluator extensions.
//
// Real implementations for OFFSET, INDIRECT, LET, REGEX.TEST, REGEX.EXTRACT,
// REGEX.REPLACE. LAMBDA + lambda-consumers (BYROW/BYCOL/REDUCE/SCAN/MAP/
// MAKEARRAY/ISOMITTED) remain deferred to a follow-up wave that introduces
// a function-value type.
// =============================================================================

import { describe, expect, it } from 'vitest';
import { createFormulaEngine } from '..';
import type { CellResolver } from '../evaluator';

const cells: Record<string, unknown> = {
  A1: 10, A2: 20, A3: 30, A4: 40,
  B1: 11, B2: 22, B3: 33, B4: 44,
  C1: 100, C2: 200, C3: 300,
};

const ranges: Record<string, ReadonlyArray<unknown>> = {
  'A1:A3': [10, 20, 30],
  'A1:B2': [10, 20, 11, 22],
  'B2:C3': [22, 33, 200, 300],
};

const resolver: CellResolver = {
  getCell: (ref) => cells[ref] ?? null,
  getRange: (ref) => ranges[ref] ?? [],
};

const engine = createFormulaEngine();
const ev = (input: string): unknown => engine.evaluate(input, resolver);

describe('@onegrid/formula — wave 15 — OFFSET', () => {
  it('OFFSET(A1, 1, 0) = A2', () => {
    expect(ev('=OFFSET(A1, 1, 0)')).toBe(20);
  });
  it('OFFSET(A1, 0, 1) = B1', () => {
    expect(ev('=OFFSET(A1, 0, 1)')).toBe(11);
  });
  it('OFFSET(A1, 2, 2) = C3', () => {
    expect(ev('=OFFSET(A1, 2, 2)')).toBe(300);
  });
  it('OFFSET with negative row → #REF!', () => {
    const r = ev('=OFFSET(A1, -5, 0)') as { code?: string };
    expect(r?.code).toBe('#REF!');
  });
});

describe('@onegrid/formula — wave 15 — INDIRECT', () => {
  it('INDIRECT("A1") fetches A1', () => {
    expect(ev('=INDIRECT("A1")')).toBe(10);
  });
  it('INDIRECT("A" & "2") composes string', () => {
    expect(ev('=INDIRECT("A" & "2")')).toBe(20);
  });
  it('INDIRECT("nonsense") → #REF!', () => {
    const r = ev('=INDIRECT("not-a-ref")') as { code?: string };
    expect(r?.code).toBe('#REF!');
  });
});

describe('@onegrid/formula — wave 15 — LET', () => {
  it('LET(x, 5, x*2) = 10', () => {
    expect(ev('=LET(x, 5, x*2)')).toBe(10);
  });
  it('LET with two bindings, later sees earlier', () => {
    expect(ev('=LET(x, 5, y, x+1, x*y)')).toBe(30);
  });
  it('LET binding shadows cell ref', () => {
    expect(ev('=LET(A1, 999, A1+1)')).toBe(1000);
  });
  it('LET error: even arg count', () => {
    const r = ev('=LET(x, 5)') as { code?: string };
    expect(r?.code).toBe('#VALUE!');
  });
});

describe('@onegrid/formula — wave 15 — REGEX.* family', () => {
  it('REGEX.TEST true / false', () => {
    expect(ev('=REGEX.TEST("hello world", "wor")')).toBe(true);
    expect(ev('=REGEX.TEST("hello world", "xyz")')).toBe(false);
  });
  it('REGEX.TEST case-insensitive', () => {
    expect(ev('=REGEX.TEST("HELLO", "hel", 1)')).toBe(true);
  });
  it('REGEX.EXTRACT first match', () => {
    expect(ev('=REGEX.EXTRACT("a1b2c3", "\\d+")')).toBe('1');
  });
  it('REGEX.EXTRACT all matches', () => {
    expect(ev('=REGEX.EXTRACT("a1b2c3", "\\d+", 1)')).toEqual(['1', '2', '3']);
  });
  it('REGEX.EXTRACT capture groups', () => {
    expect(ev('=REGEX.EXTRACT("foo:42", "(\\w+):(\\d+)", 2)')).toEqual(['foo', '42']);
  });
  it('REGEX.REPLACE replace all', () => {
    expect(ev('=REGEX.REPLACE("a1b2", "\\d", "_")')).toBe('a_b_');
  });
  it('REGEX.REPLACE Nth occurrence', () => {
    expect(ev('=REGEX.REPLACE("a1b2c3", "\\d", "_", 2)')).toBe('a1b_c3');
  });
});

describe('@onegrid/formula — wave 15 — lambda family (deferred)', () => {
  it('LAMBDA/BYROW/BYCOL/REDUCE/SCAN/MAP/MAKEARRAY/ISOMITTED return #NAME?', () => {
    for (const name of ['LAMBDA', 'BYROW', 'BYCOL', 'REDUCE', 'SCAN', 'MAP', 'MAKEARRAY', 'ISOMITTED']) {
      const r = ev(`=${name}()`) as { code?: string };
      expect(r?.code).toBe('#NAME?');
    }
  });
});
