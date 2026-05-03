import { describe, expect, it } from 'vitest';
import {
  expandRange,
  indexToLetter,
  isRangeId,
  letterToIndex,
  normalizeCellRef,
  normalizeRangeRef,
  parseCellRef,
  parseRangeRef,
} from '../range';

describe('letter ↔ index conversion', () => {
  it('A=0, B=1, …, Z=25, AA=26, AZ=51, BA=52', () => {
    expect(letterToIndex('A')).toBe(0);
    expect(letterToIndex('Z')).toBe(25);
    expect(letterToIndex('AA')).toBe(26);
    expect(letterToIndex('AZ')).toBe(51);
    expect(letterToIndex('BA')).toBe(52);
  });

  it('round-trips for the first 1000 columns', () => {
    for (let i = 0; i < 1000; i++) {
      expect(letterToIndex(indexToLetter(i))).toBe(i);
    }
  });

  it('handles lowercase inputs', () => {
    expect(letterToIndex('aa')).toBe(26);
  });
});

describe('normalizeCellRef / normalizeRangeRef', () => {
  it('strips dollar signs', () => {
    expect(normalizeCellRef('$A$1')).toBe('A1');
    expect(normalizeCellRef('$A1')).toBe('A1');
    expect(normalizeCellRef('A$1')).toBe('A1');
    expect(normalizeRangeRef('$A$1:$B$10')).toBe('A1:B10');
  });
});

describe('parseCellRef', () => {
  it('parses simple cell refs', () => {
    expect(parseCellRef('A1')).toEqual({ column: 0, row: 0 });
    expect(parseCellRef('Z99')).toEqual({ column: 25, row: 98 });
    expect(parseCellRef('AA1000')).toEqual({ column: 26, row: 999 });
  });

  it('throws on invalid input', () => {
    expect(() => parseCellRef('1A')).toThrow();
    expect(() => parseCellRef('!')).toThrow();
  });
});

describe('parseRangeRef', () => {
  it('parses A1:B10', () => {
    const { start, end } = parseRangeRef('A1:B10');
    expect(start).toEqual({ column: 0, row: 0 });
    expect(end).toEqual({ column: 1, row: 9 });
  });

  it('normalizes flipped ranges so start is top-left', () => {
    const { start, end } = parseRangeRef('B10:A1');
    expect(start).toEqual({ column: 0, row: 0 });
    expect(end).toEqual({ column: 1, row: 9 });
  });

  it('handles dollar-sign absolute refs', () => {
    const { start, end } = parseRangeRef('$A$1:$B$2');
    expect(start).toEqual({ column: 0, row: 0 });
    expect(end).toEqual({ column: 1, row: 1 });
  });
});

describe('expandRange', () => {
  it('expands a single-cell range', () => {
    expect(expandRange('A1:A1')).toEqual(['A1']);
  });

  it('expands a 2x2 range row-major', () => {
    expect(expandRange('A1:B2')).toEqual(['A1', 'B1', 'A2', 'B2']);
  });

  it('expands a column range', () => {
    expect(expandRange('A1:A4')).toEqual(['A1', 'A2', 'A3', 'A4']);
  });

  it('expands a row range', () => {
    expect(expandRange('A1:D1')).toEqual(['A1', 'B1', 'C1', 'D1']);
  });

  it('handles a 100-cell range without crashing', () => {
    const cells = expandRange('A1:A100');
    expect(cells).toHaveLength(100);
    expect(cells[0]).toBe('A1');
    expect(cells[99]).toBe('A100');
  });
});

describe('isRangeId', () => {
  it('detects ranges by colon', () => {
    expect(isRangeId('A1:A10')).toBe(true);
    expect(isRangeId('A1')).toBe(false);
  });
});
