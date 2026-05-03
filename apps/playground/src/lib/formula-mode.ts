/**
 * Formula playground mode — wires @onegrid/formula's incremental engine
 * into oneGrid's RowSource interface.
 *
 * Cells are addressed as "A1", "B2", etc. The RowSource translates
 * (rowIndex, columnId) → "{columnId}{rowIndex+1}" and reads from the
 * engine; the engine recomputes on demand via Adapton-style memoization.
 *
 * The seed dataset is a tiny spreadsheet showing four moats at once:
 *   - Literal value cells (A, B columns)
 *   - Per-row formulas (C: =A+B, E: =A*2)
 *   - Range aggregates (D1..D5: SUM/AVG/MIN/MAX/COUNT over A1:A20)
 *   - Conditional + text formulas (F: IF, G: CONCAT)
 *
 * Editing any cell triggers dirty propagation through the dependency
 * graph and re-renders the grid. The graph + dirty state are visible
 * in the toolbar's stats counter.
 */

import {
  createIncrementalEngine,
  isFormulaError,
  type IncrementalFormulaEngine,
} from '@onegrid/formula';
import type { ColumnDef, RowSource } from '@onegrid/react';

const ROW_COUNT = 20;

// Bound the visible grid; cells beyond ROW_COUNT return null and render blank.
export const FORMULA_ROW_COUNT = ROW_COUNT;

const COLUMN_IDS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;
export type FormulaColumnId = (typeof COLUMN_IDS)[number];

export const FORMULA_COLUMNS: ReadonlyArray<ColumnDef> = COLUMN_IDS.map((id) => ({
  id,
  displayName: id,
  width: id === 'G' ? 200 : id === 'D' ? 140 : 120,
  format: (value: unknown) => formatCellValue(value),
  color: (value: unknown) => {
    if (isFormulaError(value)) return '#e56f6f';
    if (typeof value === 'number') return undefined;
    if (typeof value === 'string') return '#a5b1c2';
    return '#8b929c';
  },
}));

export interface FormulaPlaygroundHandle {
  readonly engine: IncrementalFormulaEngine;
  readonly rowSource: RowSource;
  /** Map an (rowIndex, columnId) to the canonical "A1" id. */
  readonly cellIdAt: (rowIndex: number, columnId: string) => string;
  /** True if `id` has either a value or a formula stored. */
  readonly isFormula: (id: string) => boolean;
  /** Inspect what was stored — formula source if any, otherwise the literal as-is. */
  readonly getDisplaySource: (id: string) => string;
  /** Apply user input: `=foo` is a formula, anything else is parsed as
   *  number-if-finite, then string-as-fallback. */
  readonly applyInput: (id: string, input: string) => void;
  /** Force every formula to re-evaluate (e.g. after a registerFunction). */
  readonly invalidateAll: () => void;
}

/** Create + seed an incremental engine; return a RowSource bridge. */
export function createFormulaPlayground(): FormulaPlaygroundHandle {
  const engine = createIncrementalEngine();
  // Track raw input strings the user typed so we can show them back in
  // the formula bar verbatim (vs. the engine's parsed AST or computed
  // value).
  const rawInputs = new Map<string, string>();

  function applyInput(id: string, input: string): void {
    const trimmed = input.trim();
    if (trimmed === '') {
      engine.clearCell(id);
      rawInputs.delete(id);
      return;
    }
    rawInputs.set(id, input);
    if (trimmed.startsWith('=')) {
      engine.setCell(id, input);
      return;
    }
    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber) && trimmed !== '') {
      engine.setValue(id, asNumber);
      return;
    }
    engine.setValue(id, input);
  }

  // Seed: 20 rows × 7 columns of mixed content.
  for (let i = 1; i <= ROW_COUNT; i++) {
    applyInput(`A${i}`, String(i));
    applyInput(`B${i}`, String(i * 10));
    applyInput(`C${i}`, `=A${i} + B${i}`);
    applyInput(`E${i}`, `=A${i} * 2`);
    applyInput(`F${i}`, `=IF(A${i} > 10, "big", "small")`);
    applyInput(`G${i}`, `=CONCAT("row #", A${i}, " sums to ", C${i})`);
  }
  // Column D demonstrates range aggregates on column A.
  applyInput('D1', '=SUM(A1:A20)');
  applyInput('D2', '=AVERAGE(A1:A20)');
  applyInput('D3', '=MIN(A1:A20)');
  applyInput('D4', '=MAX(A1:A20)');
  applyInput('D5', '=COUNT(A1:A20)');

  const rowSource: RowSource = {
    numRows: ROW_COUNT,
    getCell: (rowIndex, columnId) => engine.getValue(`${columnId}${String(rowIndex + 1)}`),
  };

  return {
    engine,
    rowSource,
    cellIdAt: (rowIndex, columnId) => `${columnId}${String(rowIndex + 1)}`,
    isFormula: (id) => engine.getDependencies(id).length > 0,
    getDisplaySource: (id) => {
      const raw = rawInputs.get(id);
      if (raw !== undefined) return raw;
      const value = engine.getValue(id);
      if (value === null || value === undefined) return '';
      if (typeof value === 'number' || typeof value === 'string') return String(value);
      if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
      return String(value);
    },
    applyInput,
    invalidateAll: () => {
      engine.clear();
    },
  };
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return value.toString();
    // Avoid noisy floats like 1.0000000000002.
    return Number.parseFloat(value.toFixed(6)).toString();
  }
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (isFormulaError(value)) return value.toString();
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

export function indexToColumnId(colIndex: number): string {
  return COLUMN_IDS[colIndex] ?? '';
}

export function columnIdToIndex(columnId: string): number {
  return COLUMN_IDS.indexOf(columnId as FormulaColumnId);
}
