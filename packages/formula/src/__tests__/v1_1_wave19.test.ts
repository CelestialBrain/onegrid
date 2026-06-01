// =============================================================================
// @onegrid/formula — v1.1.0 wave 19: Excel-compat bug-list + date-serial.
//
// Wave 19 ships two things:
//   1. New `dateToSerial` / `serialToDate` / `isPhantomLeapSlot` helpers
//      backed by a `DateSystem` flag ('1900' | '1900-strict' | '1904').
//      Opt-in conversion; doesn't change the existing date-function
//      defaults. Required for the OOXML round-trip in wave 22.
//   2. Regression locks for the Excel-compat invariants we already match
//      (operator precedence, boolean promotion, INT/TRUNC sign-handling,
//      empty-vs-zero coercion, text-as-number coercion). These prevent
//      future refactors from silently breaking Excel parity.
//
// R1C1 mode is deferred to v1.1.x — it's a tokenizer fork that touches
// every cell-ref code path.
// =============================================================================

import { describe, expect, it } from 'vitest';
import {
  createFormulaEngine,
  dateToSerial,
  serialToDate,
  isPhantomLeapSlot,
} from '..';
import type { CellResolver } from '../evaluator';

const cells: Record<string, unknown> = { A1: 5, A2: 'hello', A3: true, A4: null, A5: '' };
const resolver: CellResolver = {
  getCell: (ref) => cells[ref] ?? null,
  getRange: () => [],
};
const engine = createFormulaEngine();
const ev = (input: string): unknown => engine.evaluate(input, resolver);

describe('@onegrid/formula — wave 19 — DATE serial conversion', () => {
  it('1900 mode: serial 1 = 1900-01-01', () => {
    const d = serialToDate(1, '1900');
    expect(d.getUTCFullYear()).toBe(1900);
    expect(d.getUTCMonth()).toBe(0);
    expect(d.getUTCDate()).toBe(1);
  });
  it('1900 mode preserves the leap-year bug: serial 60 is the phantom slot', () => {
    expect(isPhantomLeapSlot(60, '1900')).toBe(true);
    expect(isPhantomLeapSlot(60, '1900-strict')).toBe(false);
    expect(isPhantomLeapSlot(60, '1904')).toBe(false);
  });
  it('1900 mode: serial 61 = 1900-03-01 (post-bug normal day)', () => {
    const d = serialToDate(61, '1900');
    expect(d.getUTCFullYear()).toBe(1900);
    expect(d.getUTCMonth()).toBe(2);
    expect(d.getUTCDate()).toBe(1);
  });
  it('1900 mode round-trip Mar-1-1900', () => {
    const d = new Date(Date.UTC(1900, 2, 1));
    const s = dateToSerial(d, '1900');
    expect(s).toBe(61);
    expect(serialToDate(s, '1900').toISOString()).toBe(d.toISOString());
  });
  it('1900-strict mode: serial 60 = 1900-03-01 (no fake leap day)', () => {
    const d = serialToDate(60, '1900-strict');
    expect(d.getUTCFullYear()).toBe(1900);
    expect(d.getUTCMonth()).toBe(2);
    expect(d.getUTCDate()).toBe(1);
  });
  it('1904 mode: serial 0 = 1904-01-01', () => {
    const d = serialToDate(0, '1904');
    expect(d.getUTCFullYear()).toBe(1904);
    expect(d.getUTCMonth()).toBe(0);
    expect(d.getUTCDate()).toBe(1);
  });
  it('1904 round-trip preserves day count', () => {
    const d = new Date(Date.UTC(2024, 5, 15));
    expect(serialToDate(dateToSerial(d, '1904'), '1904').toISOString()).toBe(d.toISOString());
  });
});

describe('@onegrid/formula — wave 19 — Excel-compat regression locks', () => {
  it('operator precedence: -2^2 = 4 (unary tighter than ^)', () => {
    expect(ev('=-2^2')).toBe(4);
    expect(ev('=-2^3')).toBe(-8); // (-2)^3 still negative
  });
  it('precedence: power is right-associative', () => {
    expect(ev('=2^3^2')).toBe(512); // 2^(3^2) = 2^9
  });
  it('boolean ↔ 0/1 promotion: TRUE+1=2, FALSE+1=1', () => {
    expect(ev('=TRUE+1')).toBe(2);
    expect(ev('=FALSE+1')).toBe(1);
  });
  it('SUM(TRUE, FALSE) = 1', () => {
    expect(ev('=SUM(TRUE, FALSE)')).toBe(1);
  });
  it('text-as-number coercion: "5"+3 = 8', () => {
    expect(ev('="5"+3')).toBe(8);
  });
  it('text-as-number invalid: "5x"+3 = #VALUE!', () => {
    const r = ev('="5x"+3') as { code?: string };
    expect(r?.code).toBe('#VALUE!');
  });
  it('INT(-2.5) = -3 (rounds toward -∞)', () => {
    expect(ev('=INT(-2.5)')).toBe(-3);
  });
  it('TRUNC(-2.5) = -2 (rounds toward 0)', () => {
    expect(ev('=TRUNC(-2.5)')).toBe(-2);
  });
  it('empty cell coerces to 0 in arithmetic', () => {
    // A4 is null → empty
    expect(ev('=A4+5')).toBe(5);
  });
  it('empty cell coerces to "" in concat', () => {
    expect(ev('=A4&"x"')).toBe('x');
  });
  it('ISBLANK distinguishes empty cell from empty string', () => {
    // A5 is ""; Excel treats both A4 (null) and A5 ("") as blank in
    // arithmetic but ISBLANK() distinguishes by source. Our engine
    // currently treats explicit "" as not-blank (matches Excel
    // documentation for adopter cells; sheet-loaded blanks come through
    // as null).
    expect(ev('=ISBLANK(A4)')).toBe(true);
    expect(ev('=ISBLANK(A5)')).toBe(false);
  });
  it('error propagation: left-to-right; #DIV/0! short-circuits before NA()', () => {
    // Engine evaluates the left operand first; if it errors, the right
    // operand is never touched, so #DIV/0! wins regardless of what's
    // on the right.
    const r = ev('=(1/0) + NA()') as { code?: string };
    expect(r?.code).toBe('#DIV/0!');
  });
  it('IFERROR catches arithmetic errors', () => {
    expect(ev('=IFERROR(1/0, "fallback")')).toBe('fallback');
  });
  it('ROUND preserves sign: ROUND(-2.5, 0) = -3 (banker-or-half-away-from-zero)', () => {
    // Excel rounds half-away-from-zero: -2.5 → -3, 2.5 → 3.
    expect(ev('=ROUND(-2.5, 0)')).toBe(-3);
    expect(ev('=ROUND(2.5, 0)')).toBe(3);
  });
});

describe('@onegrid/formula — wave 19 — R1C1 mode (deferred)', () => {
  it('documented deferral: R1C1 parsing is not yet wired', () => {
    // R1C1 is tracked under v1.1.x. Right now `R1C1` parses as an
    // identifier (it's [A-Z][0-9][A-Z][0-9] which doesn't match the
    // cell-ref regex `[A-Z]+[0-9]+`), so the bare-identifier path
    // surfaces #NAME?. Locking this behavior so the deferral is visible.
    const r = ev('=R1C1') as { code?: string };
    expect(r?.code).toBe('#NAME?');
  });
});
