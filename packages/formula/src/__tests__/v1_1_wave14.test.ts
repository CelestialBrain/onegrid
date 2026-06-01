// =============================================================================
// @onegrid/formula — v1.1.0 wave 14: cell-metadata introspection.
//
// CELL / INFO / SHEET / SHEETS / FORMULATEXT / ISFORMULA / ISREF go through
// the evaluator end-to-end so the per-call CallContext sidechannel actually
// fires.
// =============================================================================

import { describe, expect, it } from 'vitest';
import { createFormulaEngine } from '..';
import type { CellResolver } from '../evaluator';

const cells: Record<string, unknown> = {
  A1: 42,
  B2: 'hello',
  C3: '',
  D4: true,
};

const resolver: CellResolver = {
  getCell: (ref) => cells[ref] ?? null,
  getRange: () => [],
};

const engine = createFormulaEngine();
const ev = (input: string): unknown => engine.evaluate(input, resolver);

describe('@onegrid/formula — wave 14 — CELL', () => {
  it('CELL("address", A1) returns absolute A1 form', () => {
    expect(ev('=CELL("address", A1)')).toBe('$A$1');
    expect(ev('=CELL("address", $C$5)')).toBe('$C$5');
  });
  it('CELL("col"/"row")', () => {
    expect(ev('=CELL("col", A1)')).toBe(1);
    expect(ev('=CELL("row", A1)')).toBe(1);
    expect(ev('=CELL("col", D4)')).toBe(4);
    expect(ev('=CELL("row", D4)')).toBe(4);
  });
  it('CELL("contents") returns value', () => {
    expect(ev('=CELL("contents", A1)')).toBe(42);
    expect(ev('=CELL("contents", B2)')).toBe('hello');
  });
  it('CELL("type") returns b/l/v', () => {
    expect(ev('=CELL("type", C3)')).toBe('b'); // empty string treated blank
    expect(ev('=CELL("type", B2)')).toBe('l');
    expect(ev('=CELL("type", A1)')).toBe('v');
    expect(ev('=CELL("type", D4)')).toBe('v');
  });
  it('CELL("width") returns default 10', () => {
    expect(ev('=CELL("width", A1)')).toBe(10);
  });
});

describe('@onegrid/formula — wave 14 — INFO', () => {
  it('INFO("release") identifies the engine', () => {
    expect(ev('=INFO("release")')).toBe('@onegrid/formula');
  });
  it('INFO("recalc") is Automatic', () => {
    expect(ev('=INFO("recalc")')).toBe('Automatic');
  });
  it('INFO("numfile") is 1', () => {
    expect(ev('=INFO("numfile")')).toBe(1);
  });
});

describe('@onegrid/formula — wave 14 — SHEET / SHEETS', () => {
  it('return 1 (single-sheet model)', () => {
    expect(ev('=SHEET()')).toBe(1);
    expect(ev('=SHEETS()')).toBe(1);
  });
});

describe('@onegrid/formula — wave 14 — FORMULATEXT', () => {
  it('serializes the AST of the reference argument', () => {
    expect(ev('=FORMULATEXT(A1)')).toBe('A1');
  });
  it('errors on non-reference', () => {
    const r = ev('=FORMULATEXT("hi")');
    expect(typeof r === 'object' && r !== null && 'code' in r).toBe(true);
  });
});

describe('@onegrid/formula — wave 14 — ISFORMULA / ISREF', () => {
  it('ISREF distinguishes references from literals', () => {
    expect(ev('=ISREF(A1)')).toBe(true);
    expect(ev('=ISREF(A1:B2)')).toBe(true);
    expect(ev('=ISREF("A1")')).toBe(false);
    expect(ev('=ISREF(42)')).toBe(false);
  });
  it('ISFORMULA is conservative-false for references', () => {
    expect(ev('=ISFORMULA(A1)')).toBe(false);
  });
  it('ISFORMULA errors on non-reference', () => {
    const r = ev('=ISFORMULA(42)');
    expect(typeof r === 'object' && r !== null && 'code' in r).toBe(true);
  });
});
