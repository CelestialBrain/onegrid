// =============================================================================
// Range parsing and expansion
//
// Excel cell references take the forms:
//   A1            — relative
//   $A$1, $A1, A$1 — absolute (locked column / row)
//
// Range references concatenate two cell refs with `:`:
//   A1:B10
//   $A$1:$B$10
//
// For dependency-graph purposes the dollar signs don't matter — they only
// affect how the formula moves under copy-paste, not what it reads. We
// strip them so "$A$1" and "A1" share a single graph node.
//
// expandRange("A1:B3") yields ["A1", "B1", "A2", "B2", "A3", "B3"] — row-
// major. The order matches the "natural" reading order spreadsheet users
// expect for SUM / AVG / COUNT and is also what aoa_to_sheet(2D-array)
// produces, so range arrays line up with their visual layout.
// =============================================================================

export interface CellRef {
  readonly column: number; // 0-based
  readonly row: number; // 0-based
}

export function normalizeCellRef(ref: string): string {
  return ref.replace(/\$/g, '');
}

export function normalizeRangeRef(ref: string): string {
  return ref.replace(/\$/g, '');
}

export function parseCellRef(ref: string): CellRef {
  const normalized = normalizeCellRef(ref);
  const match = /^([A-Za-z]+)(\d+)$/.exec(normalized);
  if (!match) {
    throw new Error(`parseCellRef: invalid reference "${ref}"`);
  }
  const [, letters, digits] = match;
  return {
    column: letterToIndex(letters!),
    row: Number(digits) - 1,
  };
}

export function parseRangeRef(ref: string): { start: CellRef; end: CellRef } {
  const normalized = normalizeRangeRef(ref);
  const idx = normalized.indexOf(':');
  if (idx < 0) {
    throw new Error(`parseRangeRef: missing ':' in "${ref}"`);
  }
  const startRef = normalized.slice(0, idx);
  const endRef = normalized.slice(idx + 1);
  let start = parseCellRef(startRef);
  let end = parseCellRef(endRef);
  // Normalize so start is top-left, end is bottom-right.
  if (start.column > end.column || start.row > end.row) {
    const minCol = Math.min(start.column, end.column);
    const maxCol = Math.max(start.column, end.column);
    const minRow = Math.min(start.row, end.row);
    const maxRow = Math.max(start.row, end.row);
    start = { column: minCol, row: minRow };
    end = { column: maxCol, row: maxRow };
  }
  return { start, end };
}

/**
 * Expand a range reference into the list of cells it covers, in row-major
 * order. `expandRange("A1:B2")` → `["A1","B1","A2","B2"]`.
 *
 * The result is always non-empty (a 1×1 range expands to one cell).
 *
 * For very large ranges (>100k cells) the array allocation can be costly;
 * the engine caps range size internally to keep memory bounded.
 */
export function expandRange(ref: string): string[] {
  const { start, end } = parseRangeRef(ref);
  const out: string[] = [];
  for (let r = start.row; r <= end.row; r++) {
    for (let c = start.column; c <= end.column; c++) {
      out.push(`${indexToLetter(c)}${String(r + 1)}`);
    }
  }
  return out;
}

/** A1 = column 0, Z = 25, AA = 26, AB = 27, … */
export function letterToIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64); // 'A'=65 → 1
  }
  return n - 1;
}

export function indexToLetter(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    n -= 1;
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

/**
 * Quick predicate: is this id a range? Cell ids never contain ':'; range
 * ids always do (after normalization).
 */
export function isRangeId(id: string): boolean {
  return id.includes(':');
}
