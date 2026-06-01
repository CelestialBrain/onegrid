// =============================================================================
// Higher-order array functions (v1.1.0 wave 16).
//
// BYROW / BYCOL / MAP / REDUCE / SCAN / MAKEARRAY / ISOMITTED all consume a
// FormulaFunction value (constructed by LAMBDA in the evaluator). Each one
// invokes the lambda via its `.call(args)` thunk; the lambda already carries
// its captured resolver, so cell refs inside the body still resolve against
// the lexical scope where LAMBDA was constructed.
// =============================================================================

import { toNumber } from '../coerce';
import { NUM_ERROR, VALUE_ERROR, isFormulaError } from '../errors';
import {
  isFormulaFunction,
  OMITTED,
  register,
  to2D,
  type FormulaFunction,
} from './_shared';

function requireLambda(v: unknown): FormulaFunction | typeof VALUE_ERROR {
  return isFormulaFunction(v) ? v : VALUE_ERROR;
}

function isLambda(v: FormulaFunction | typeof VALUE_ERROR): v is FormulaFunction {
  return v !== VALUE_ERROR;
}

// BYROW(array, lambda) — apply `lambda(row)` per row, return a column vector.
register('BYROW', (args) => {
  if (args.length !== 2) return VALUE_ERROR;
  const arr = to2D(args[0]);
  const fn = requireLambda(args[1]);
  if (!isLambda(fn)) return fn;
  if (fn.params.length !== 1) return VALUE_ERROR;
  return arr.map((row) => [fn.call([row])]);
});

// BYCOL(array, lambda) — apply `lambda(col)` per column, return a row vector.
register('BYCOL', (args) => {
  if (args.length !== 2) return VALUE_ERROR;
  const arr = to2D(args[0]);
  const fn = requireLambda(args[1]);
  if (!isLambda(fn)) return fn;
  if (fn.params.length !== 1) return VALUE_ERROR;
  if (arr.length === 0) return [[]];
  const width = arr[0]!.length;
  const row: unknown[] = [];
  for (let c = 0; c < width; c++) {
    const col = arr.map((r) => r[c]);
    row.push(fn.call([col]));
  }
  return [row];
});

// MAP(array1, [array2, ...], lambda) — element-wise. All arrays must share
// the same shape; lambda arity must match the array count.
register('MAP', (args) => {
  if (args.length < 2) return VALUE_ERROR;
  const fn = requireLambda(args[args.length - 1]);
  if (!isLambda(fn)) return fn;
  const arrayArgs = args.slice(0, -1).map(to2D);
  if (arrayArgs.length !== fn.params.length) return VALUE_ERROR;
  const rows = arrayArgs[0]!.length;
  const cols = arrayArgs[0]!.length > 0 ? arrayArgs[0]![0]!.length : 0;
  for (const a of arrayArgs) {
    if (a.length !== rows) return VALUE_ERROR;
    if (rows > 0 && a[0]!.length !== cols) return VALUE_ERROR;
  }
  const out: unknown[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: unknown[] = [];
    for (let c = 0; c < cols; c++) {
      const call = arrayArgs.map((a) => a[r]![c]);
      row.push(fn.call(call));
    }
    out.push(row);
  }
  return out;
});

// REDUCE(initial, array, lambda(acc, value)) — left fold.
register('REDUCE', (args) => {
  if (args.length !== 3) return VALUE_ERROR;
  const fn = requireLambda(args[2]);
  if (!isLambda(fn)) return fn;
  if (fn.params.length !== 2) return VALUE_ERROR;
  const arr = to2D(args[1]).flat();
  let acc = args[0];
  for (const v of arr) {
    acc = fn.call([acc, v]);
    if (isFormulaError(acc)) return acc;
  }
  return acc;
});

// SCAN(initial, array, lambda(acc, value)) — left fold with history (returns
// the running array of accumulators, one per input element, in the input's
// original shape).
register('SCAN', (args) => {
  if (args.length !== 3) return VALUE_ERROR;
  const fn = requireLambda(args[2]);
  if (!isLambda(fn)) return fn;
  if (fn.params.length !== 2) return VALUE_ERROR;
  const arr = to2D(args[1]);
  let acc = args[0];
  const out: unknown[][] = [];
  for (const row of arr) {
    const outRow: unknown[] = [];
    for (const v of row) {
      acc = fn.call([acc, v]);
      if (isFormulaError(acc)) return acc;
      outRow.push(acc);
    }
    out.push(outRow);
  }
  return out;
});

// MAKEARRAY(rows, cols, lambda(row, col)) — generate a 2D array from index
// pairs. Indices are 1-based per Excel convention.
register('MAKEARRAY', (args) => {
  if (args.length !== 3) return VALUE_ERROR;
  const rowsN = toNumber(args[0]);
  if (isFormulaError(rowsN)) return rowsN;
  const colsN = toNumber(args[1]);
  if (isFormulaError(colsN)) return colsN;
  const rows = Math.trunc(rowsN);
  const cols = Math.trunc(colsN);
  if (rows < 1 || cols < 1) return NUM_ERROR;
  const fn = requireLambda(args[2]);
  if (!isLambda(fn)) return fn;
  if (fn.params.length !== 2) return VALUE_ERROR;
  const out: unknown[][] = [];
  for (let r = 1; r <= rows; r++) {
    const row: unknown[] = [];
    for (let c = 1; c <= cols; c++) {
      row.push(fn.call([r, c]));
    }
    out.push(row);
  }
  return out;
});

// ISOMITTED(arg) — true if the caller passed nothing for this lambda
// parameter. Higher-order callers fill missing slots with the `OMITTED`
// sentinel; bare user calls hit `undefined`.
register('ISOMITTED', (args) => {
  return args[0] === OMITTED || args[0] === undefined;
});
