// =============================================================================
// Dynamic-array spill tracker (v1.1.0 wave 17).
//
// In modern Excel, a formula that returns an array "spills" into the
// neighboring cells: `=SEQUENCE(5)` in A1 fills A1..A5. The `#` operator
// reads the spilled range back: `=SUM(A1#)` sums whatever A1 spilled.
//
// The engine doesn't own the cell store, so the SpillTracker is a separate
// registry the adopter wires into the resolver. The contract:
//
//   1. After evaluating a top-level formula whose result is a 2D array,
//      the adopter calls `recordSpill(anchorRef, result)`.
//   2. When the parser sees `A1#`, the evaluator routes through
//      `lookupSpill(anchorRef)` (via the resolver's optional `getSpill`)
//      to fetch the spilled array.
//   3. Before recording, the adopter checks `wouldCollide(anchorRef, shape,
//      isOccupied)` and emits `#SPILL!` if the target range is blocked.
//
// This module ships the tracker shape and helpers; the actual resolver
// integration is per-adopter (a CellResolver gains an optional
// `getSpill(ref): unknown[][] | undefined`).
// =============================================================================

import { FormulaError, SPILL_ERROR } from './errors';

export interface SpillExtent {
  /** Number of rows the spilled range covers, including the anchor row. */
  readonly rows: number;
  /** Number of columns the spilled range covers, including the anchor col. */
  readonly cols: number;
}

export interface SpillRecord {
  readonly anchor: string;
  readonly extent: SpillExtent;
  readonly values: ReadonlyArray<ReadonlyArray<unknown>>;
}

/**
 * A minimal in-memory spill tracker. Adopters can swap in their own store
 * (Redis-backed, persistent, etc.) by implementing the same shape.
 */
export class SpillTracker {
  private readonly byAnchor = new Map<string, SpillRecord>();

  record(anchor: string, values: ReadonlyArray<ReadonlyArray<unknown>>): SpillRecord {
    const rows = values.length;
    const cols = rows > 0 ? values[0]!.length : 0;
    const rec: SpillRecord = { anchor, extent: { rows, cols }, values };
    this.byAnchor.set(anchor, rec);
    return rec;
  }

  lookup(anchor: string): SpillRecord | undefined {
    return this.byAnchor.get(anchor);
  }

  clear(anchor: string): void {
    this.byAnchor.delete(anchor);
  }

  clearAll(): void {
    this.byAnchor.clear();
  }
}

/**
 * Normalize an arbitrary evaluation result into a 2D array shape if it
 * represents a spilled output, or `null` if it's a scalar (no spill).
 * Single-row 1D arrays spread horizontally; column-of-rows stays as-is.
 */
export function asSpilled(value: unknown): unknown[][] | null {
  if (!Array.isArray(value)) return null;
  if (value.length === 0) return [[]];
  // Already 2D?
  if (Array.isArray(value[0])) {
    return value as unknown[][];
  }
  // 1D: treat as a column vector (Excel default when context is ambiguous).
  return (value as unknown[]).map((v) => [v]);
}

/**
 * Returns SPILL_ERROR if any of the cells the spill would cover (other
 * than the anchor itself) is occupied by an existing non-empty cell.
 * `isOccupied(ref)` is supplied by the adopter and answers "would writing
 * to `ref` overwrite a user-entered value?".
 */
export function checkSpillCollision(
  anchor: string,
  extent: SpillExtent,
  isOccupied: (ref: string) => boolean,
): FormulaError | null {
  const parsed = parseAnchor(anchor);
  if (!parsed) return SPILL_ERROR;
  for (let r = 0; r < extent.rows; r++) {
    for (let c = 0; c < extent.cols; c++) {
      if (r === 0 && c === 0) continue;
      const ref = `${colLetters(parsed.col + c)}${parsed.row + r}`;
      if (isOccupied(ref)) return SPILL_ERROR;
    }
  }
  return null;
}

function parseAnchor(ref: string): { col: number; row: number } | undefined {
  const m = /^\$?([A-Z]+)\$?(\d+)$/.exec(ref.toUpperCase());
  if (!m) return undefined;
  const letters = m[1]!;
  let col = 0;
  for (let i = 0; i < letters.length; i++) col = col * 26 + (letters.charCodeAt(i) - 64);
  return { col, row: Number(m[2]) };
}

function colLetters(col: number): string {
  let s = '';
  let n = col;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
