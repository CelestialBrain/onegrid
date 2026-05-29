// =============================================================================
// Matrix functions (v1.1.0 wave 10) — MMULT, MINVERSE, MDETERM, TRANSPOSE,
// MUNIT. Inverse and determinant use Gauss-Jordan with partial pivoting;
// adequate for the small (<= ~100x100) matrices typical in spreadsheets.
// =============================================================================

import { toNumber } from '../coerce';
import { type FormulaError, NUM_ERROR, VALUE_ERROR, isFormulaError } from '../errors';
import { register, to2D } from './_shared';

function toMatrix(v: unknown): number[][] | FormulaError {
  const g = to2D(v);
  const out: number[][] = [];
  for (const row of g) {
    const r: number[] = [];
    for (const c of row) {
      const n = toNumber(c);
      if (isFormulaError(n)) return n;
      r.push(n);
    }
    out.push(r);
  }
  return out;
}

register('TRANSPOSE', (args) => {
  const a = to2D(args[0]);
  if (a.length === 0) return [];
  const rows = a.length;
  const cols = a[0]!.length;
  const out: unknown[][] = Array.from({ length: cols }, () => new Array(rows));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      out[j]![i] = a[i]![j];
    }
  }
  return out;
});

register('MUNIT', (args) => {
  const n = toNumber(args[0]);
  if (isFormulaError(n)) return n;
  const k = Math.trunc(n);
  if (k <= 0) return VALUE_ERROR;
  const out: number[][] = [];
  for (let i = 0; i < k; i++) {
    const row = new Array<number>(k).fill(0);
    row[i] = 1;
    out.push(row);
  }
  return out;
});

register('MMULT', (args) => {
  const a = toMatrix(args[0]);
  if (isFormulaError(a)) return a;
  const b = toMatrix(args[1]);
  if (isFormulaError(b)) return b;
  if (a.length === 0 || b.length === 0) return VALUE_ERROR;
  const ar = a.length;
  const ac = a[0]!.length;
  const br = b.length;
  const bc = b[0]!.length;
  if (ac !== br) return VALUE_ERROR;
  const out: number[][] = Array.from({ length: ar }, () => new Array<number>(bc).fill(0));
  for (let i = 0; i < ar; i++) {
    for (let k = 0; k < ac; k++) {
      const aik = a[i]![k]!;
      for (let j = 0; j < bc; j++) {
        out[i]![j]! += aik * b[k]![j]!;
      }
    }
  }
  return out;
});

function gaussJordan(m: number[][]): { inv: number[][]; det: number } | FormulaError {
  const n = m.length;
  if (n === 0 || m.some((r) => r.length !== n)) return VALUE_ERROR;
  const a: number[][] = m.map((r) => [...r]);
  const inv: number[][] = Array.from({ length: n }, (_, i) => {
    const row = new Array<number>(n).fill(0);
    row[i] = 1;
    return row;
  });
  let det = 1;
  for (let col = 0; col < n; col++) {
    // Partial pivot
    let pivotRow = col;
    let pivotMag = Math.abs(a[col]![col]!);
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(a[r]![col]!);
      if (v > pivotMag) {
        pivotMag = v;
        pivotRow = r;
      }
    }
    if (pivotMag < 1e-14) return NUM_ERROR;
    if (pivotRow !== col) {
      [a[col], a[pivotRow]] = [a[pivotRow]!, a[col]!];
      [inv[col], inv[pivotRow]] = [inv[pivotRow]!, inv[col]!];
      det = -det;
    }
    const piv = a[col]![col]!;
    det *= piv;
    for (let j = 0; j < n; j++) {
      a[col]![j]! /= piv;
      inv[col]![j]! /= piv;
    }
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r]![col]!;
      if (f === 0) continue;
      for (let j = 0; j < n; j++) {
        a[r]![j]! -= f * a[col]![j]!;
        inv[r]![j]! -= f * inv[col]![j]!;
      }
    }
  }
  return { inv, det };
}

register('MINVERSE', (args) => {
  const m = toMatrix(args[0]);
  if (isFormulaError(m)) return m;
  const r = gaussJordan(m);
  if (isFormulaError(r)) return r;
  return r.inv;
});

register('MDETERM', (args) => {
  const m = toMatrix(args[0]);
  if (isFormulaError(m)) return m;
  const n = m.length;
  if (n === 0 || m.some((r) => r.length !== n)) return VALUE_ERROR;
  // LU with partial pivoting, no allocation of the inverse.
  const a = m.map((r) => [...r]);
  let det = 1;
  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let pivotMag = Math.abs(a[col]![col]!);
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(a[r]![col]!);
      if (v > pivotMag) {
        pivotMag = v;
        pivotRow = r;
      }
    }
    if (pivotMag === 0) return 0;
    if (pivotRow !== col) {
      [a[col], a[pivotRow]] = [a[pivotRow]!, a[col]!];
      det = -det;
    }
    const piv = a[col]![col]!;
    det *= piv;
    for (let r = col + 1; r < n; r++) {
      const f = a[r]![col]! / piv;
      for (let j = col; j < n; j++) a[r]![j]! -= f * a[col]![j]!;
    }
  }
  return det;
});
