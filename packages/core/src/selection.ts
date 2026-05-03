// =============================================================================
// SelectionModel
//
// Tracks a set of rectangular cell ranges plus an "active" cell (the one with
// keyboard focus). Operations match Excel/Google Sheets semantics:
//
//   click          → replace selection with a single cell
//   click + drag   → replace selection with a single rectangle
//   shift + click  → extend the last range to include the clicked cell
//   ctrl + click   → add a new single-cell range (multi-rect selection)
//   shift + arrow  → extend the active range by one cell in the given direction
//   ctrl/cmd + a   → select all (signaled by `selectAll`; the grid passes
//                    its own row/col counts)
//   ctrl/cmd + c   → serialize current selection to TSV via toTsv()
//
// The model is pure — no DOM, no events. Grid wires pointer/keyboard
// handlers and calls these methods, then re-renders.
// =============================================================================

export interface CellPosition {
  readonly row: number;
  readonly col: number;
}

export interface CellRange {
  /** The cell where this range started (mouse-down or shift-click base). */
  readonly anchor: CellPosition;
  /** The cell where the active edge of this range currently lives. */
  readonly active: CellPosition;
}

export interface NormalizedRange {
  readonly rowStart: number;
  readonly rowEnd: number;
  readonly colStart: number;
  readonly colEnd: number;
}

export interface SelectionSnapshot {
  readonly ranges: ReadonlyArray<CellRange>;
  readonly active: CellPosition | null;
}

export class SelectionModel {
  private rangesArr: CellRange[] = [];
  private activeCell: CellPosition | null = null;

  get ranges(): ReadonlyArray<CellRange> {
    return this.rangesArr;
  }

  get active(): CellPosition | null {
    return this.activeCell;
  }

  snapshot(): SelectionSnapshot {
    return { ranges: this.rangesArr.slice(), active: this.activeCell };
  }

  isEmpty(): boolean {
    return this.rangesArr.length === 0;
  }

  /** Returns true if (row, col) is inside any current range. */
  contains(row: number, col: number): boolean {
    for (const r of this.rangesArr) {
      const norm = normalize(r);
      if (
        row >= norm.rowStart &&
        row <= norm.rowEnd &&
        col >= norm.colStart &&
        col <= norm.colEnd
      ) {
        return true;
      }
    }
    return false;
  }

  /** Replace all ranges with a single 1×1 selection at the given cell. */
  selectCell(pos: CellPosition): void {
    this.rangesArr = [{ anchor: pos, active: pos }];
    this.activeCell = pos;
  }

  /** Begin a new range at the given cell, replacing existing ones. */
  startRange(pos: CellPosition): void {
    this.rangesArr = [{ anchor: pos, active: pos }];
    this.activeCell = pos;
  }

  /** Extend the LAST range's active edge to the given cell. */
  extendActiveRange(pos: CellPosition): void {
    const last = this.rangesArr[this.rangesArr.length - 1];
    if (!last) {
      this.startRange(pos);
      return;
    }
    this.rangesArr[this.rangesArr.length - 1] = { anchor: last.anchor, active: pos };
    this.activeCell = pos;
  }

  /** Add a new 1×1 range without clearing existing ones (ctrl/cmd-click). */
  addRange(pos: CellPosition): void {
    this.rangesArr = [...this.rangesArr, { anchor: pos, active: pos }];
    this.activeCell = pos;
  }

  /** Set every cell in [0..rowCount)×[0..colCount) as selected. */
  selectAll(rowCount: number, colCount: number): void {
    if (rowCount === 0 || colCount === 0) {
      this.clear();
      return;
    }
    const tl: CellPosition = { row: 0, col: 0 };
    const br: CellPosition = { row: rowCount - 1, col: colCount - 1 };
    this.rangesArr = [{ anchor: tl, active: br }];
    this.activeCell = tl;
  }

  clear(): void {
    this.rangesArr = [];
    this.activeCell = null;
  }

  /**
   * Move the active cell by (dr, dc), replacing selection with a single
   * cell. Caller passes the row/col bounds for clamping.
   */
  moveActive(dr: number, dc: number, rowCount: number, colCount: number): void {
    const cur = this.activeCell ?? { row: 0, col: 0 };
    const next = {
      row: clamp(cur.row + dr, 0, rowCount - 1),
      col: clamp(cur.col + dc, 0, colCount - 1),
    };
    this.selectCell(next);
  }

  /**
   * Extend the last range by moving its active edge by (dr, dc), keeping the
   * anchor fixed.
   */
  extendActiveBy(dr: number, dc: number, rowCount: number, colCount: number): void {
    const last = this.rangesArr[this.rangesArr.length - 1];
    if (!last || !this.activeCell) {
      this.moveActive(dr, dc, rowCount, colCount);
      return;
    }
    const next = {
      row: clamp(this.activeCell.row + dr, 0, rowCount - 1),
      col: clamp(this.activeCell.col + dc, 0, colCount - 1),
    };
    this.rangesArr[this.rangesArr.length - 1] = { anchor: last.anchor, active: next };
    this.activeCell = next;
  }

  normalizedRanges(): NormalizedRange[] {
    return this.rangesArr.map(normalize);
  }

  /**
   * Serialize the selection as Tab-Separated Values for clipboard paste into
   * Excel/Sheets/Numbers. Multi-range selections take the bounding rectangle
   * of all ranges and emit one TSV grid (Excel's behavior).
   */
  toTsv(getCell: (row: number, col: number) => string): string {
    if (this.rangesArr.length === 0) return '';
    let rowStart = Infinity;
    let rowEnd = -Infinity;
    let colStart = Infinity;
    let colEnd = -Infinity;
    for (const norm of this.normalizedRanges()) {
      if (norm.rowStart < rowStart) rowStart = norm.rowStart;
      if (norm.rowEnd > rowEnd) rowEnd = norm.rowEnd;
      if (norm.colStart < colStart) colStart = norm.colStart;
      if (norm.colEnd > colEnd) colEnd = norm.colEnd;
    }
    const lines: string[] = [];
    for (let r = rowStart; r <= rowEnd; r++) {
      const cells: string[] = [];
      for (let c = colStart; c <= colEnd; c++) {
        const inSelection = this.contains(r, c);
        cells.push(inSelection ? escapeTsvCell(getCell(r, c)) : '');
      }
      lines.push(cells.join('\t'));
    }
    return lines.join('\n');
  }
}

export function normalize(range: CellRange): NormalizedRange {
  return {
    rowStart: Math.min(range.anchor.row, range.active.row),
    rowEnd: Math.max(range.anchor.row, range.active.row),
    colStart: Math.min(range.anchor.col, range.active.col),
    colEnd: Math.max(range.anchor.col, range.active.col),
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function escapeTsvCell(value: string): string {
  // Excel TSV: cells containing tab, newline, or quote get wrapped in quotes
  // with internal quotes doubled.
  if (/[\t\n"]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
