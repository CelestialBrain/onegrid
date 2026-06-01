// =============================================================================
// @onegrid/xlsx — sheet formula reader tests (Chunk A scaffold).
// =============================================================================

import { describe, expect, it } from 'vitest';
import { parseSheetFormulas } from '../parse-sheet';
import { serializeFormula } from '../serialize';
import { escapeXml, unescapeXml } from '../xml';

const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1"><v>10</v></c>
      <c r="A2"><v>20</v></c>
      <c r="A3"><v>30</v></c>
      <c r="B1"><f>SUM(A1:A3)</f><v>60</v></c>
      <c r="B2"><f>A1+A2*A3</f><v>610</v></c>
      <c r="B3"><f>"hello &amp; goodbye"</f></c>
    </row>
    <row r="2">
      <c r="C1"><f t="shared" ref="C1:C3" si="0">A1*2</f><v>20</v></c>
      <c r="C2"><f t="shared" si="0"/><v>40</v></c>
      <c r="C3"><f t="shared" si="0"/><v>60</v></c>
    </row>
  </sheetData>
</worksheet>`;

describe('@onegrid/xlsx — parseSheetFormulas', () => {
  it('emits one entry per formula-bearing cell', () => {
    const entries = parseSheetFormulas(sheetXml);
    expect(entries.map((e) => e.ref)).toEqual(['B1', 'B2', 'B3', 'C1', 'C2', 'C3']);
  });
  it('parses normal cells to an AST', () => {
    const entries = parseSheetFormulas(sheetXml);
    const b1 = entries.find((e) => e.ref === 'B1')!;
    expect(b1.source).toBe('SUM(A1:A3)');
    expect(b1.ast?.kind).toBe('call');
    if (b1.ast?.kind === 'call') {
      expect(b1.ast.name).toBe('SUM');
    }
  });
  it('preserves cached values', () => {
    const entries = parseSheetFormulas(sheetXml);
    const b1 = entries.find((e) => e.ref === 'B1')!;
    expect(b1.cachedValue).toBe('60');
  });
  it('unescapes XML entities in formula source', () => {
    const entries = parseSheetFormulas(sheetXml);
    const b3 = entries.find((e) => e.ref === 'B3')!;
    expect(b3.source).toBe('"hello & goodbye"');
  });
  it('shared formulas: master + dependents reuse the AST', () => {
    const entries = parseSheetFormulas(sheetXml);
    const c1 = entries.find((e) => e.ref === 'C1')!;
    const c2 = entries.find((e) => e.ref === 'C2')!;
    const c3 = entries.find((e) => e.ref === 'C3')!;
    expect(c1.formulaType).toBe('shared');
    expect(c1.sharedIndex).toBe(0);
    expect(c1.sharedRef).toBe('C1:C3');
    expect(c2.formulaType).toBe('shared');
    // Dependent cells inherit the master's AST.
    expect(c2.ast?.kind).toBe('binary');
    expect(c3.ast?.kind).toBe('binary');
  });
  it('returns parse errors without throwing the whole batch', () => {
    const broken = `<worksheet><sheetData>
      <c r="A1"><f>SUM(((</f></c>
      <c r="A2"><f>1+1</f></c>
    </sheetData></worksheet>`;
    const entries = parseSheetFormulas(broken);
    expect(entries[0]!.ast).toBeUndefined();
    expect(entries[0]!.parseError).toBeDefined();
    expect(entries[1]!.ast?.kind).toBe('binary');
  });
});

describe('@onegrid/xlsx — serializeFormula', () => {
  it('round-trips a SUM call', () => {
    const ast = parseSheetFormulas(sheetXml).find((e) => e.ref === 'B1')!.ast!;
    expect(serializeFormula(ast)).toBe('SUM(A1:A3)');
  });
  it('preserves precedence without redundant parens', () => {
    const ast = parseSheetFormulas(sheetXml).find((e) => e.ref === 'B2')!.ast!;
    // Expected canonical form: A1+A2*A3 — multiplication binds tighter, no
    // parens needed.
    expect(serializeFormula(ast)).toBe('A1+A2*A3');
  });
});

describe('@onegrid/xlsx — XML escape helpers', () => {
  it('escape then unescape round-trips', () => {
    const original = 'a & b < c > d "quote" \'apos\'';
    expect(unescapeXml(escapeXml(original))).toBe(original);
  });
  it('decodes numeric entities', () => {
    expect(unescapeXml('A&#65;B')).toBe('AAB');
    expect(unescapeXml('A&#x41;B')).toBe('AAB');
  });
});
