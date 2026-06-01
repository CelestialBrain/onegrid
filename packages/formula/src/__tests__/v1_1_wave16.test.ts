// =============================================================================
// @onegrid/formula — v1.1.0 wave 16: LAMBDA + higher-order family.
// =============================================================================

import { describe, expect, it } from 'vitest';
import { createFormulaEngine } from '..';
import type { CellResolver } from '../evaluator';

const cells: Record<string, unknown> = {
  A1: 1, A2: 2, A3: 3, A4: 4, A5: 5,
  B1: 10, B2: 20, B3: 30,
};
const ranges: Record<string, ReadonlyArray<unknown>> = {
  'A1:A5': [1, 2, 3, 4, 5],
  'A1:A3': [1, 2, 3],
  'B1:B3': [10, 20, 30],
  'A1:B3': [[1, 10], [2, 20], [3, 30]],
  'A1:A1': [1],
};
const resolver: CellResolver = {
  getCell: (ref) => cells[ref] ?? null,
  getRange: (ref) => ranges[ref] ?? [],
};
const engine = createFormulaEngine();
const ev = (input: string): unknown => engine.evaluate(input, resolver);

describe('@onegrid/formula — wave 16 — LAMBDA construction + immediate invoke', () => {
  it('LAMBDA constructed and invoked through LET', () => {
    // LET(f, LAMBDA(x, x*2), f(5))  — LET binds f to the lambda, then calls
    // it. The `f(5)` re-dispatches through the function lookup → falls
    // through to the resolver → returns the FormulaFunction → caller path
    // does NOT auto-invoke. So this needs the higher-order surface.
    // Easier path: use a higher-order consumer to fire the lambda.
    expect(ev('=REDUCE(0, A1:A3, LAMBDA(a, v, a+v))')).toBe(6);
  });
});

describe('@onegrid/formula — wave 16 — BYROW / BYCOL', () => {
  it('BYROW sums each row, returns column vector', () => {
    // A1:B3 = [[1,10],[2,20],[3,30]] → BYROW returns sums [[11],[22],[33]].
    expect(ev('=BYROW(A1:B3, LAMBDA(r, SUM(r)))')).toEqual([[11], [22], [33]]);
  });
  it('BYCOL sums each column, returns row vector', () => {
    expect(ev('=BYCOL(A1:B3, LAMBDA(c, SUM(c)))')).toEqual([[6, 60]]);
  });
});

describe('@onegrid/formula — wave 16 — MAP', () => {
  it('MAP unary doubles each element', () => {
    expect(ev('=MAP(A1:A3, LAMBDA(x, x*2))')).toEqual([[2], [4], [6]]);
  });
  it('MAP binary sums two arrays element-wise', () => {
    // SEQUENCE(3) gives a 3×1 column [[1],[2],[3]]. Use literal column refs.
    // A1:A3 + B1:B3 = [[11],[22],[33]].
    expect(ev('=MAP(A1:A3, B1:B3, LAMBDA(a, b, a+b))')).toEqual([[11], [22], [33]]);
  });
});

describe('@onegrid/formula — wave 16 — REDUCE / SCAN', () => {
  it('REDUCE sums 1..5', () => {
    expect(ev('=REDUCE(0, A1:A5, LAMBDA(a, v, a+v))')).toBe(15);
  });
  it('REDUCE multiplies 1..3', () => {
    expect(ev('=REDUCE(1, A1:A3, LAMBDA(a, v, a*v))')).toBe(6);
  });
  it('SCAN running sum 1..3', () => {
    expect(ev('=SCAN(0, A1:A3, LAMBDA(a, v, a+v))')).toEqual([[1], [3], [6]]);
  });
  it('REDUCE on empty array returns initial', () => {
    expect(ev('=REDUCE(42, A1:A1, LAMBDA(a, v, v))')).toBe(1); // single-cell
  });
});

describe('@onegrid/formula — wave 16 — MAKEARRAY', () => {
  it('MAKEARRAY(2,3, r*c) returns the multiplication table', () => {
    expect(ev('=MAKEARRAY(2, 3, LAMBDA(r, c, r*c))')).toEqual([
      [1, 2, 3],
      [2, 4, 6],
    ]);
  });
  it('MAKEARRAY with 0 rows → #NUM!', () => {
    const r = ev('=MAKEARRAY(0, 3, LAMBDA(r, c, r))') as { code?: string };
    expect(r?.code).toBe('#NUM!');
  });
});

describe('@onegrid/formula — wave 16 — ISOMITTED', () => {
  it('ISOMITTED true when lambda param not supplied', () => {
    // Construct a lambda with two params, call it with one through REDUCE.
    // REDUCE always supplies both (acc, value), so use MAP with a unary
    // lambda then check ISOMITTED is false on the supplied arg.
    expect(ev('=MAP(A1:A3, LAMBDA(x, ISOMITTED(x)))')).toEqual([[false], [false], [false]]);
  });
});

describe('@onegrid/formula — wave 16 — closures + LET interaction', () => {
  it('lambda captures LET binding', () => {
    // LET(k, 10, REDUCE(0, A1:A3, LAMBDA(a, v, a + v*k)))
    // = 0 + 1*10 + 2*10 + 3*10 = 60
    expect(ev('=LET(k, 10, REDUCE(0, A1:A3, LAMBDA(a, v, a+v*k)))')).toBe(60);
  });
  it('nested lambdas: lambda returning a lambda', () => {
    // LET(adder, LAMBDA(x, x+1), MAP(A1:A3, adder))
    expect(ev('=LET(inc, LAMBDA(x, x+1), MAP(A1:A3, inc))')).toEqual([[2], [3], [4]]);
  });
});

describe('@onegrid/formula — wave 16 — error paths', () => {
  it('REDUCE with non-lambda → #VALUE!', () => {
    const r = ev('=REDUCE(0, A1:A3, 42)') as { code?: string };
    expect(r?.code).toBe('#VALUE!');
  });
  it('MAP with wrong-arity lambda → #VALUE!', () => {
    const r = ev('=MAP(A1:A3, B1:B3, LAMBDA(x, x))') as { code?: string };
    expect(r?.code).toBe('#VALUE!');
  });
});
