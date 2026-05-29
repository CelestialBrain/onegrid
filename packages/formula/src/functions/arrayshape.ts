// =============================================================================
// Array-shaping functions (v1.1.0 wave 10) — Excel 365 dynamic-array helpers:
// WRAPROWS / WRAPCOLS, TAKE / DROP, CHOOSEROWS / CHOOSECOLS, EXPAND, TOROW /
// TOCOL, HSTACK / VSTACK.
//
// All operate on 2D arrays (via to2D). Negative row/col counts in TAKE / DROP
// reference from the end. EXPAND pads with #N/A by default to match Excel.
// =============================================================================

import { type FormulaError, NA_ERROR, NUM_ERROR, VALUE_ERROR, isFormulaError } from '../errors';
import { register, to2D } from './_shared';
import { toNumber } from '../coerce';

function flatToRow(arr: unknown[][]): unknown[] {
  const out: unknown[] = [];
  for (const row of arr) for (const v of row) out.push(v);
  return out;
}

function flatToCol(arr: unknown[][]): unknown[] {
  const out: unknown[] = [];
  if (arr.length === 0) return out;
  const cols = arr[0]!.length;
  for (let j = 0; j < cols; j++) for (let i = 0; i < arr.length; i++) out.push(arr[i]![j]);
  return out;
}

register('TOROW', (args) => {
  const a = to2D(args[0]);
  return [flatToRow(a)];
});
register('TOCOL', (args) => {
  const a = to2D(args[0]);
  return flatToCol(a).map((v) => [v]);
});

register('WRAPROWS', (args) => {
  const a = to2D(args[0]);
  const flat = flatToRow(a);
  const n = toNumber(args[1]);
  if (isFormulaError(n)) return n;
  const wrap = Math.trunc(n);
  if (wrap <= 0) return NUM_ERROR;
  const pad = args[2] === undefined ? NA_ERROR : args[2];
  const out: unknown[][] = [];
  for (let i = 0; i < flat.length; i += wrap) {
    const row = flat.slice(i, i + wrap);
    while (row.length < wrap) row.push(pad);
    out.push(row);
  }
  return out;
});

register('WRAPCOLS', (args) => {
  const a = to2D(args[0]);
  const flat = flatToCol(a);
  const n = toNumber(args[1]);
  if (isFormulaError(n)) return n;
  const wrap = Math.trunc(n);
  if (wrap <= 0) return NUM_ERROR;
  const pad = args[2] === undefined ? NA_ERROR : args[2];
  const cols: unknown[][] = [];
  for (let i = 0; i < flat.length; i += wrap) {
    const col = flat.slice(i, i + wrap);
    while (col.length < wrap) col.push(pad);
    cols.push(col);
  }
  // Cols of length `wrap` → matrix of `wrap` rows × cols.length cols.
  const out: unknown[][] = Array.from({ length: wrap }, () => new Array(cols.length));
  for (let j = 0; j < cols.length; j++) {
    for (let i = 0; i < wrap; i++) out[i]![j] = cols[j]![i];
  }
  return out;
});

function takeRange(total: number, n: number): [number, number] {
  if (n >= 0) return [0, Math.min(n, total)];
  return [Math.max(0, total + n), total];
}

register('TAKE', (args) => {
  const a = to2D(args[0]);
  const rows = a.length;
  const cols = a[0]?.length ?? 0;
  const rArg = args[1] === undefined || args[1] === '' ? rows : toNumber(args[1]);
  if (isFormulaError(rArg)) return rArg;
  const cArg = args[2] === undefined || args[2] === '' ? cols : toNumber(args[2]);
  if (isFormulaError(cArg)) return cArg;
  const [r0, r1] = takeRange(rows, Math.trunc(rArg));
  const [c0, c1] = takeRange(cols, Math.trunc(cArg));
  const out: unknown[][] = [];
  for (let i = r0; i < r1; i++) out.push(a[i]!.slice(c0, c1));
  return out.length === 0 ? VALUE_ERROR : out;
});

register('DROP', (args) => {
  const a = to2D(args[0]);
  const rows = a.length;
  const cols = a[0]?.length ?? 0;
  const rArg = args[1] === undefined || args[1] === '' ? 0 : toNumber(args[1]);
  if (isFormulaError(rArg)) return rArg;
  const cArg = args[2] === undefined || args[2] === '' ? 0 : toNumber(args[2]);
  if (isFormulaError(cArg)) return cArg;
  const r = Math.trunc(rArg);
  const c = Math.trunc(cArg);
  const r0 = r >= 0 ? Math.min(r, rows) : 0;
  const r1 = r >= 0 ? rows : Math.max(0, rows + r);
  const c0 = c >= 0 ? Math.min(c, cols) : 0;
  const c1 = c >= 0 ? cols : Math.max(0, cols + c);
  const out: unknown[][] = [];
  for (let i = r0; i < r1; i++) out.push(a[i]!.slice(c0, c1));
  return out.length === 0 ? VALUE_ERROR : out;
});

function chooseIndices(args: ReadonlyArray<unknown>, limit: number): number[] | FormulaError {
  const out: number[] = [];
  for (let i = 1; i < args.length; i++) {
    const v = args[i];
    if (v === undefined) continue;
    const n = toNumber(v);
    if (isFormulaError(n)) return n;
    const idx = Math.trunc(n);
    const real = idx >= 0 ? idx - 1 : limit + idx;
    if (real < 0 || real >= limit) return VALUE_ERROR;
    out.push(real);
  }
  return out;
}

register('CHOOSEROWS', (args) => {
  const a = to2D(args[0]);
  const idxs = chooseIndices(args, a.length);
  if (isFormulaError(idxs)) return idxs;
  return idxs.map((i) => [...a[i]!]);
});

register('CHOOSECOLS', (args) => {
  const a = to2D(args[0]);
  const cols = a[0]?.length ?? 0;
  const idxs = chooseIndices(args, cols);
  if (isFormulaError(idxs)) return idxs;
  return a.map((row) => idxs.map((j) => row[j]));
});

register('EXPAND', (args) => {
  const a = to2D(args[0]);
  const rows = a.length;
  const cols = a[0]?.length ?? 0;
  const tr = args[1] === undefined || args[1] === '' ? rows : toNumber(args[1]);
  if (isFormulaError(tr)) return tr;
  const tc = args[2] === undefined || args[2] === '' ? cols : toNumber(args[2]);
  if (isFormulaError(tc)) return tc;
  const pad = args[3] === undefined ? NA_ERROR : args[3];
  const r = Math.trunc(tr);
  const c = Math.trunc(tc);
  if (r < rows || c < cols) return NUM_ERROR;
  const out: unknown[][] = [];
  for (let i = 0; i < r; i++) {
    const row: unknown[] = [];
    for (let j = 0; j < c; j++) {
      row.push(i < rows && j < cols ? a[i]![j] : pad);
    }
    out.push(row);
  }
  return out;
});

register('HSTACK', (args) => {
  const grids = args.map((g) => to2D(g));
  const maxRows = grids.reduce((m, g) => Math.max(m, g.length), 0);
  const out: unknown[][] = Array.from({ length: maxRows }, () => []);
  for (const g of grids) {
    const cols = g[0]?.length ?? 0;
    for (let i = 0; i < maxRows; i++) {
      for (let j = 0; j < cols; j++) {
        out[i]!.push(i < g.length ? g[i]![j] : NA_ERROR);
      }
    }
  }
  return out;
});

register('VSTACK', (args) => {
  const grids = args.map((g) => to2D(g));
  const maxCols = grids.reduce((m, g) => Math.max(m, g[0]?.length ?? 0), 0);
  const out: unknown[][] = [];
  for (const g of grids) {
    for (const row of g) {
      const r = [...row];
      while (r.length < maxCols) r.push(NA_ERROR);
      out.push(r);
    }
  }
  return out;
});
