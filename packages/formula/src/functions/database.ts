// =============================================================================
// Database category (v1.1.0 wave 8).
//
// D-functions filter a tabular range (header row + data rows) by a criteria
// range (header row + one or more criteria rows) and aggregate the matched
// rows. The criteria semantics are Excel's: predicates within a row are
// AND'd by column header; criteria rows are OR'd. Field selection accepts
// a 1-based column index OR a header name.
// =============================================================================

import { compare, toNumber } from '../coerce';
import { DIV_ZERO, type FormulaError, NUM_ERROR, VALUE_ERROR, isFormulaError } from '../errors';
import { matchesCriterion, register, to2D } from './_shared';

function resolveField(db: unknown[][], field: unknown): number | FormulaError {
  if (typeof field === 'number') {
    const idx = Math.trunc(field) - 1;
    if (idx < 0 || idx >= (db[0]?.length ?? 0)) return VALUE_ERROR;
    return idx;
  }
  if (typeof field === 'string') {
    const headers = db[0] ?? [];
    for (let i = 0; i < headers.length; i++) {
      if (compare(headers[i], field) === 0) return i;
    }
    return VALUE_ERROR;
  }
  return VALUE_ERROR;
}

function rowMatches(
  row: unknown[],
  dbHeaders: unknown[],
  critHeaders: unknown[],
  critRow: unknown[],
): boolean {
  for (let c = 0; c < critHeaders.length; c++) {
    const criterion = critRow[c];
    if (criterion === null || criterion === undefined || criterion === '') continue;
    const header = critHeaders[c];
    if (header === null || header === undefined || header === '') continue;
    let colIdx = -1;
    for (let i = 0; i < dbHeaders.length; i++) {
      if (compare(dbHeaders[i], header) === 0) {
        colIdx = i;
        break;
      }
    }
    if (colIdx === -1) return false;
    if (!matchesCriterion(row[colIdx], criterion)) return false;
  }
  return true;
}

function matchedRows(db: unknown[][], criteria: unknown[][]): unknown[][] {
  const dbHeaders = db[0] ?? [];
  const dataRows = db.slice(1);
  const critHeaders = criteria[0] ?? [];
  const critRows = criteria.slice(1);
  if (critRows.length === 0) return dataRows;
  const out: unknown[][] = [];
  for (const row of dataRows) {
    for (const cr of critRows) {
      if (rowMatches(row, dbHeaders, critHeaders, cr)) {
        out.push(row);
        break;
      }
    }
  }
  return out;
}

type DAggregator = (values: unknown[], allValues: unknown[]) => number | FormulaError;

function dFn(agg: DAggregator) {
  return (args: ReadonlyArray<unknown>): unknown => {
    const db = to2D(args[0]);
    const criteria = to2D(args[2]);
    if (db.length < 2) return NUM_ERROR;
    const field = resolveField(db, args[1]);
    if (isFormulaError(field)) return field;
    const rows = matchedRows(db, criteria);
    const all = rows.map((r) => r[field]);
    const numeric: unknown[] = [];
    for (const v of all) {
      if (v === null || v === undefined || v === '') continue;
      if (isFormulaError(v)) return v;
      const n = toNumber(v);
      if (!isFormulaError(n)) numeric.push(n);
    }
    return agg(numeric, all);
  };
}

register(
  'DSUM',
  dFn((vals) => (vals as number[]).reduce((a, b) => a + b, 0)),
);

register(
  'DAVERAGE',
  dFn((vals) => {
    const ns = vals as number[];
    if (ns.length === 0) return DIV_ZERO;
    return ns.reduce((a, b) => a + b, 0) / ns.length;
  }),
);

register(
  'DCOUNT',
  dFn((vals) => (vals as number[]).length),
);

register(
  'DCOUNTA',
  dFn((_vals, all) => all.filter((v) => v !== null && v !== undefined && v !== '').length),
);

register(
  'DMAX',
  dFn((vals) => {
    const ns = vals as number[];
    if (ns.length === 0) return 0;
    return Math.max(...ns);
  }),
);

register(
  'DMIN',
  dFn((vals) => {
    const ns = vals as number[];
    if (ns.length === 0) return 0;
    return Math.min(...ns);
  }),
);

register(
  'DPRODUCT',
  dFn((vals) => (vals as number[]).reduce((a, b) => a * b, 1)),
);

register(
  'DSTDEV',
  dFn((vals) => {
    const ns = vals as number[];
    if (ns.length < 2) return DIV_ZERO;
    const m = ns.reduce((a, b) => a + b, 0) / ns.length;
    const v = ns.reduce((a, b) => a + (b - m) * (b - m), 0) / (ns.length - 1);
    return Math.sqrt(v);
  }),
);

register(
  'DSTDEVP',
  dFn((vals) => {
    const ns = vals as number[];
    if (ns.length === 0) return DIV_ZERO;
    const m = ns.reduce((a, b) => a + b, 0) / ns.length;
    const v = ns.reduce((a, b) => a + (b - m) * (b - m), 0) / ns.length;
    return Math.sqrt(v);
  }),
);

register(
  'DVAR',
  dFn((vals) => {
    const ns = vals as number[];
    if (ns.length < 2) return DIV_ZERO;
    const m = ns.reduce((a, b) => a + b, 0) / ns.length;
    return ns.reduce((a, b) => a + (b - m) * (b - m), 0) / (ns.length - 1);
  }),
);

register(
  'DVARP',
  dFn((vals) => {
    const ns = vals as number[];
    if (ns.length === 0) return DIV_ZERO;
    const m = ns.reduce((a, b) => a + b, 0) / ns.length;
    return ns.reduce((a, b) => a + (b - m) * (b - m), 0) / ns.length;
  }),
);

// DGET returns the single matching cell; #NUM! if 0 matches, #VALUE! if >1.
register('DGET', (args) => {
  const db = to2D(args[0]);
  const criteria = to2D(args[2]);
  if (db.length < 2) return NUM_ERROR;
  const field = resolveField(db, args[1]);
  if (isFormulaError(field)) return field;
  const rows = matchedRows(db, criteria);
  if (rows.length === 0) return VALUE_ERROR;
  if (rows.length > 1) return NUM_ERROR;
  return rows[0]![field];
});
