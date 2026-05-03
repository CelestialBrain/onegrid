import { describe, expect, it } from 'vitest';
import { SelectionModel, normalize } from '../selection';

const cell = (row: number, col: number) => ({ row, col });

describe('SelectionModel', () => {
  it('starts empty', () => {
    const s = new SelectionModel();
    expect(s.isEmpty()).toBe(true);
    expect(s.active).toBeNull();
    expect(s.ranges).toHaveLength(0);
  });

  it('selectCell creates a 1x1 range', () => {
    const s = new SelectionModel();
    s.selectCell(cell(2, 3));
    expect(s.ranges).toHaveLength(1);
    expect(s.contains(2, 3)).toBe(true);
    expect(s.contains(2, 4)).toBe(false);
    expect(s.active).toEqual(cell(2, 3));
  });

  it('extendActiveRange grows the last range', () => {
    const s = new SelectionModel();
    s.startRange(cell(2, 3));
    s.extendActiveRange(cell(5, 7));
    expect(s.contains(2, 3)).toBe(true);
    expect(s.contains(5, 7)).toBe(true);
    expect(s.contains(3, 5)).toBe(true);
    expect(s.active).toEqual(cell(5, 7));
  });

  it('handles backward ranges (active before anchor)', () => {
    const s = new SelectionModel();
    s.startRange(cell(5, 7));
    s.extendActiveRange(cell(2, 3));
    expect(s.contains(2, 3)).toBe(true);
    expect(s.contains(5, 7)).toBe(true);
    expect(s.contains(4, 5)).toBe(true);
  });

  it('addRange preserves prior ranges', () => {
    const s = new SelectionModel();
    s.selectCell(cell(0, 0));
    s.addRange(cell(5, 5));
    expect(s.ranges).toHaveLength(2);
    expect(s.contains(0, 0)).toBe(true);
    expect(s.contains(5, 5)).toBe(true);
    expect(s.contains(2, 2)).toBe(false);
  });

  it('selectAll covers the entire grid', () => {
    const s = new SelectionModel();
    s.selectAll(10, 5);
    expect(s.ranges).toHaveLength(1);
    expect(s.contains(0, 0)).toBe(true);
    expect(s.contains(9, 4)).toBe(true);
    expect(s.contains(10, 5)).toBe(false);
  });

  it('clear removes all ranges and active cell', () => {
    const s = new SelectionModel();
    s.selectCell(cell(2, 3));
    s.clear();
    expect(s.isEmpty()).toBe(true);
    expect(s.active).toBeNull();
  });

  it('moveActive clamps to bounds', () => {
    const s = new SelectionModel();
    s.selectCell(cell(0, 0));
    s.moveActive(-1, -1, 10, 10);
    expect(s.active).toEqual(cell(0, 0));
    s.moveActive(20, 20, 10, 10);
    expect(s.active).toEqual(cell(9, 9));
  });

  it('extendActiveBy moves only the active edge', () => {
    const s = new SelectionModel();
    s.startRange(cell(2, 2));
    s.extendActiveBy(0, 3, 10, 10);
    expect(s.active).toEqual(cell(2, 5));
    expect(s.contains(2, 2)).toBe(true);
    expect(s.contains(2, 5)).toBe(true);
  });

  it('toTsv emits tab/newline-separated values for the bounding box', () => {
    const s = new SelectionModel();
    s.startRange(cell(0, 0));
    s.extendActiveRange(cell(1, 1));
    const tsv = s.toTsv((r, c) => `${String(r)},${String(c)}`);
    expect(tsv).toBe('0,0\t0,1\n1,0\t1,1');
  });

  it('toTsv leaves non-selected cells in the bounding box empty', () => {
    const s = new SelectionModel();
    s.selectCell(cell(0, 0));
    s.addRange(cell(2, 2));
    const tsv = s.toTsv((r, c) => `${String(r)}.${String(c)}`);
    // bounding box rows 0..2, cols 0..2; only (0,0) and (2,2) are selected.
    expect(tsv).toBe('0.0\t\t\n\t\t\n\t\t2.2');
  });

  it('toTsv escapes tab/newline/quote', () => {
    const s = new SelectionModel();
    s.selectCell(cell(0, 0));
    const tsv = s.toTsv(() => 'a\tb"c');
    expect(tsv).toBe('"a\tb""c"');
  });

  it('normalize() flips active/anchor when active < anchor', () => {
    const norm = normalize({ anchor: cell(5, 7), active: cell(2, 3) });
    expect(norm).toEqual({ rowStart: 2, rowEnd: 5, colStart: 3, colEnd: 7 });
  });
});
