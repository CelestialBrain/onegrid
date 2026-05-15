// =============================================================================
// BigInt-safe formula path (v0.0.10 item 3) — verifies precision is
// preserved when operands fit in bigint, and that mixing with floats
// gracefully degrades to Number arithmetic.
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  toNumeric,
  addNumeric,
  subNumeric,
  mulNumeric,
  divNumeric,
} from '../coerce';
import { evaluate } from '../evaluator';
import { parseFormula } from '../parser';
import { DIV_ZERO, VALUE_ERROR } from '../errors';

function evalWithCells(
  src: string,
  cells: Record<string, unknown>,
): unknown {
  const ast = parseFormula(src);
  return evaluate(ast, {
    getCell: (ref) => cells[ref] ?? 0,
    getRange: () => [],
  });
}

describe('toNumeric', () => {
  it('passes through bigint', () => {
    expect(toNumeric(123n)).toBe(123n);
  });

  it('keeps safe-integer Number as Number', () => {
    expect(toNumeric(42)).toBe(42);
    expect(toNumeric(1.5)).toBe(1.5);
  });

  it('promotes Number > MAX_SAFE_INTEGER to bigint when integer', () => {
    const big = Number.MAX_SAFE_INTEGER + 1;
    const r = toNumeric(big);
    expect(typeof r).toBe('bigint');
  });

  it('parses all-digit strings to bigint', () => {
    expect(toNumeric('9007199254740993')).toBe(9007199254740993n);
    expect(toNumeric('-9007199254740993')).toBe(-9007199254740993n);
  });

  it('parses fractional strings to Number', () => {
    expect(toNumeric('1.5')).toBe(1.5);
  });

  it('coerces boolean to 0n/1n', () => {
    expect(toNumeric(true)).toBe(1n);
    expect(toNumeric(false)).toBe(0n);
  });
});

describe('Arithmetic preserves BigInt precision', () => {
  const huge = 9_007_199_254_740_993n; // 2^53 + 1

  it('addNumeric(bigint, bigint) stays bigint and stays exact', () => {
    expect(addNumeric(huge, 1n)).toBe(huge + 1n);
  });

  it('subNumeric(bigint, bigint)', () => {
    expect(subNumeric(huge, 1n)).toBe(huge - 1n);
  });

  it('mulNumeric(bigint, bigint) holds 64-bit precision', () => {
    expect(mulNumeric(3_000_000_000n, 3_000_000_000n)).toBe(
      9_000_000_000_000_000_000n,
    );
  });

  it('divNumeric(bigint, bigint) returns bigint only when exact', () => {
    expect(divNumeric(10n, 2n)).toBe(5n);
    // 7 / 2 = 3.5 — not exact, falls through to Number
    expect(divNumeric(7n, 2n)).toBe(3.5);
  });

  it('division by zero → DIV_ZERO regardless of side type', () => {
    expect(divNumeric(5n, 0n)).toBe(DIV_ZERO);
    expect(divNumeric(5, 0)).toBe(DIV_ZERO);
    expect(divNumeric(5n, 0)).toBe(DIV_ZERO);
  });
});

describe('Mixed arithmetic falls back to Number', () => {
  it('bigint + float → number', () => {
    const r = addNumeric(10n, 0.5);
    expect(typeof r).toBe('number');
    expect(r).toBe(10.5);
  });

  it('float * bigint → number', () => {
    const r = mulNumeric(2.0, 3n);
    expect(r).toBe(6);
  });
});

describe('Formula evaluator wires through BigInt path', () => {
  it('A1 + B1 where both are bigints stays exact past 2^53', () => {
    const r = evalWithCells('A1+B1', {
      A1: 9_007_199_254_740_993n,
      B1: 1n,
    });
    expect(r).toBe(9_007_199_254_740_994n);
  });

  it('A1 * B1 large × large stays exact', () => {
    const r = evalWithCells('A1*B1', {
      A1: 3_000_000_000n,
      B1: 3_000_000_000n,
    });
    expect(r).toBe(9_000_000_000_000_000_000n);
  });

  it('exact bigint division returns bigint', () => {
    const r = evalWithCells('A1/B1', {
      A1: 100n,
      B1: 5n,
    });
    expect(r).toBe(20n);
  });

  it('inexact bigint division degrades to float', () => {
    const r = evalWithCells('A1/B1', {
      A1: 7n,
      B1: 2n,
    });
    expect(r).toBe(3.5);
  });

  it('mixing bigint and float falls back to float arithmetic', () => {
    const r = evalWithCells('A1+B1', { A1: 10n, B1: 0.5 });
    expect(r).toBe(10.5);
  });

  it('integer-string operands produce bigint when both look integral', () => {
    const r = evalWithCells('A1+B1', {
      A1: '9007199254740993',
      B1: '1',
    });
    expect(r).toBe(9_007_199_254_740_994n);
  });

  it('exponent (^) stays Number even when both are bigint (Excel-compat)', () => {
    const r = evalWithCells('A1^B1', { A1: 2n, B1: 10n });
    expect(r).toBe(1024);
  });

  it('errors propagate through the BigInt path', () => {
    const r = evalWithCells('A1+B1', { A1: 'not-a-number', B1: 1n });
    expect(r).toBe(VALUE_ERROR);
  });
});
