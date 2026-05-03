import { describe, expect, it } from 'vitest';
import { tokenize } from '../tokenizer';
import { parseFormula } from '../parser';
import {
  DEFAULT_WHOLE_COLUMN_MAX_ROW,
  expandRange,
  isWholeColumnRange,
  parseRangeRef,
} from '../range';
import { createIncrementalEngine } from '../incremental';

describe('whole-column ref tokenization', () => {
  it('tokenizes A:A as a rangeRef', () => {
    const tokens = tokenize('=A:A');
    expect(tokens[0]?.type).toBe('rangeRef');
    expect(tokens[0]?.value).toBe('A:A');
  });

  it('tokenizes $A:$A with absolute markers', () => {
    const tokens = tokenize('=$A:$A');
    expect(tokens[0]?.type).toBe('rangeRef');
    expect(tokens[0]?.value).toBe('$A:$A');
  });

  it('tokenizes multi-column whole-column ranges A:C', () => {
    const tokens = tokenize('=A:C');
    expect(tokens[0]?.type).toBe('rangeRef');
    expect(tokens[0]?.value).toBe('A:C');
  });

  it('still tokenizes A1:B10 as a regular range', () => {
    const tokens = tokenize('=A1:B10');
    expect(tokens[0]?.type).toBe('rangeRef');
    expect(tokens[0]?.value).toBe('A1:B10');
  });
});

describe('whole-column ref parsing', () => {
  it('parser accepts =SUM(A:A)', () => {
    const ast = parseFormula('=SUM(A:A)');
    expect(ast.kind).toBe('call');
    if (ast.kind !== 'call') return;
    expect(ast.name).toBe('SUM');
    expect(ast.args[0]?.kind).toBe('rangeRef');
  });

  it('parseRangeRef expands A:A to row 0 .. DEFAULT_MAX_ROW-1', () => {
    const { start, end } = parseRangeRef('A:A');
    expect(start).toEqual({ column: 0, row: 0 });
    expect(end).toEqual({ column: 0, row: DEFAULT_WHOLE_COLUMN_MAX_ROW - 1 });
  });

  it('parseRangeRef handles A:C as columns 0..2', () => {
    const { start, end } = parseRangeRef('A:C');
    expect(start.column).toBe(0);
    expect(end.column).toBe(2);
  });

  it('parseRangeRef honors wholeColumnMaxRow override', () => {
    const { end } = parseRangeRef('A:A', { wholeColumnMaxRow: 50 });
    expect(end.row).toBe(49);
  });

  it('isWholeColumnRange detects A:A', () => {
    expect(isWholeColumnRange('A:A')).toBe(true);
    expect(isWholeColumnRange('A1:A10')).toBe(false);
    expect(isWholeColumnRange('A1')).toBe(false);
  });

  it('expandRange yields wholeColumnMaxRow cells per column', () => {
    const cells = expandRange('A:A', { wholeColumnMaxRow: 5 });
    expect(cells).toEqual(['A1', 'A2', 'A3', 'A4', 'A5']);
  });
});

describe('incremental engine with whole-column refs', () => {
  it('SUM(A:A) evaluates over the default-bounded range', () => {
    const e = createIncrementalEngine();
    // Only A1..A5 have values; rest are null/0.
    e.setValue('A1', 10);
    e.setValue('A2', 20);
    e.setValue('A3', 30);
    e.setValue('A4', 40);
    e.setValue('A5', 50);
    // Note: A:A under DEFAULT_WHOLE_COLUMN_MAX_ROW (1000) iterates 1000
    // cells; the unset ones contribute 0 to SUM.
    e.setCell('B1', '=SUM(A:A)');
    expect(e.getValue('B1')).toBe(150);
  });

  it('changing a cell inside the whole-column range invalidates dependents', () => {
    const e = createIncrementalEngine();
    e.setValue('A1', 100);
    e.setCell('B1', '=SUM(A:A)');
    expect(e.getValue('B1')).toBe(100);
    e.setValue('A50', 25);
    expect(e.getValue('B1')).toBe(125);
  });
});
