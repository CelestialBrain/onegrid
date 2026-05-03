import { describe, expect, it } from 'vitest';
import { createFormulaEngine } from '..';
import { isFormulaError } from '../errors';
import type { CellResolver } from '../evaluator';

const cells: Record<string, unknown> = {
  A1: 10,
  A2: 20,
  A3: 30,
  B1: 'foo',
  B2: 'bar',
  C1: true,
  D1: null,
};

const ranges: Record<string, ReadonlyArray<unknown>> = {
  'A1:A3': [10, 20, 30],
  'A1:B2': [10, 20, 'foo', 'bar'],
};

const resolver: CellResolver = {
  getCell: (ref) => cells[ref] ?? null,
  getRange: (ref) => ranges[ref] ?? [],
};

const engine = createFormulaEngine();

const ev = (input: string): unknown => engine.evaluate(input, resolver);

describe('evaluate (arithmetic + refs)', () => {
  it('evaluates simple arithmetic', () => {
    expect(ev('=1 + 2')).toBe(3);
    expect(ev('=2 * 3 + 4')).toBe(10);
    expect(ev('=2 ^ 10')).toBe(1024);
    expect(ev('=10 / 4')).toBe(2.5);
  });

  it('returns #DIV/0! on division by zero', () => {
    const r = ev('=10 / 0');
    expect(isFormulaError(r)).toBe(true);
  });

  it('reads cell refs', () => {
    expect(ev('=A1')).toBe(10);
    expect(ev('=A1 + A2')).toBe(30);
  });

  it('SUM over a range', () => {
    expect(ev('=SUM(A1:A3)')).toBe(60);
  });

  it('AVERAGE over a range', () => {
    expect(ev('=AVERAGE(A1:A3)')).toBe(20);
  });

  it('IF returns the right branch', () => {
    expect(ev('=IF(A1 > 5, "big", "small")')).toBe('big');
    expect(ev('=IF(A1 > 50, "big", "small")')).toBe('small');
  });

  it('AND / OR / NOT short-circuit', () => {
    expect(ev('=AND(TRUE, FALSE)')).toBe(false);
    expect(ev('=OR(FALSE, TRUE)')).toBe(true);
    expect(ev('=NOT(TRUE)')).toBe(false);
  });

  it('LEN, UPPER, LOWER, TRIM', () => {
    expect(ev('=LEN("hello")')).toBe(5);
    expect(ev('=UPPER("hi")')).toBe('HI');
    expect(ev('=LOWER("HI")')).toBe('hi');
    expect(ev('=TRIM("  spaces  ")')).toBe('spaces');
  });

  it('CONCAT joins strings and numbers', () => {
    expect(ev('=CONCAT("a", 1, "b")')).toBe('a1b');
  });

  it('LEFT / RIGHT / MID', () => {
    expect(ev('=LEFT("hello", 2)')).toBe('he');
    expect(ev('=RIGHT("hello", 2)')).toBe('lo');
    expect(ev('=MID("hello", 2, 3)')).toBe('ell');
  });

  it('comparison operators', () => {
    expect(ev('=1 = 1')).toBe(true);
    expect(ev('=1 <> 2')).toBe(true);
    expect(ev('=1 < 2')).toBe(true);
    expect(ev('=2 >= 2')).toBe(true);
  });

  it('unknown function returns #NAME?', () => {
    const r = ev('=BOGUS(1, 2)');
    expect(isFormulaError(r)).toBe(true);
    if (!isFormulaError(r)) return;
    expect(r.code).toBe('#NAME?');
  });

  it('errors propagate through arithmetic', () => {
    const r = ev('=A1 + (10/0)');
    expect(isFormulaError(r)).toBe(true);
  });

  it('IFERROR catches errors', () => {
    expect(ev('=IFERROR(10/0, "oops")')).toBe('oops');
  });

  it('ISBLANK / ISNUMBER / ISTEXT', () => {
    expect(ev('=ISBLANK(D1)')).toBe(true);
    expect(ev('=ISNUMBER(A1)')).toBe(true);
    expect(ev('=ISTEXT(B1)')).toBe(true);
  });

  it('engine.listFunctions includes core built-ins', () => {
    const fns = engine.listFunctions();
    expect(fns).toContain('SUM');
    expect(fns).toContain('IF');
    expect(fns).toContain('LEN');
  });

  it('registerFunction adds custom functions usable in formulas', () => {
    engine.registerFunction('DOUBLE', (args) => Number(args[0]) * 2);
    expect(ev('=DOUBLE(7)')).toBe(14);
  });

  it('percent operator divides by 100', () => {
    expect(ev('=50%')).toBe(0.5);
  });

  it('concat operator &', () => {
    expect(ev('="a" & "b"')).toBe('ab');
  });
});
