// =============================================================================
// Shared registry + helpers for the function library.
//
// Each category file under `./functions/` imports `register` from here to
// install its functions into the shared `builtins` map. The barrel
// `functions.ts` then imports each category for its side effects and
// re-exports the registry API.
// =============================================================================

import { compare, toNumber } from '../coerce';
import { FormulaError, NUM_ERROR, VALUE_ERROR, isFormulaError } from '../errors';

export type FormulaFn = (args: ReadonlyArray<unknown>) => unknown;

const builtins = new Map<string, FormulaFn>();

export function register(name: string, fn: FormulaFn): void {
  builtins.set(name.toUpperCase(), fn);
}

export function getFunction(name: string): FormulaFn | undefined {
  return builtins.get(name.toUpperCase());
}

export function registerFormulaFunction(name: string, fn: FormulaFn): void {
  builtins.set(name.toUpperCase(), fn);
}

export function listFormulaFunctions(): string[] {
  return [...builtins.keys()].sort();
}

// ----- Array helpers ---------------------------------------------------------

export function* flatten(args: ReadonlyArray<unknown>): Generator<unknown> {
  for (const a of args) {
    if (Array.isArray(a)) {
      yield* flatten(a as ReadonlyArray<unknown>);
    } else {
      yield a;
    }
  }
}

export function flattenNumbers(
  args: ReadonlyArray<unknown>,
): { values: number[]; error?: FormulaError } {
  const values: number[] = [];
  for (const a of flatten(args)) {
    if (a === null || a === undefined || a === '') continue;
    if (isFormulaError(a)) return { values: [], error: a };
    const n = toNumber(a);
    if (isFormulaError(n)) continue;
    values.push(n);
  }
  return { values };
}

export function firstError(args: ReadonlyArray<unknown>): FormulaError | undefined {
  for (const a of flatten(args)) {
    if (isFormulaError(a)) return a;
  }
  return undefined;
}

// ----- Date helpers (used by both datetime + financial categories) ----------

export const MS_PER_DAY = 86_400_000;

export function toDate(v: unknown): Date | FormulaError {
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string') {
    const t = Date.parse(v);
    if (Number.isFinite(t)) return new Date(t);
  }
  return VALUE_ERROR;
}

export function daysBetween(a: Date, b: Date): number {
  const aDay = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const bDay = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((bDay - aDay) / MS_PER_DAY);
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() + n);
  return r;
}

export function addMonths(d: Date, n: number): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), 1);
  r.setMonth(r.getMonth() + n);
  const lastDay = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(d.getDate(), lastDay));
  return r;
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

// ----- Day-count conventions (wave 13: bond / depreciation plumbing) --------
//
// Basis codes follow Excel / OOXML §18.17:
//   0 — US (NASD) 30/360
//   1 — Actual/Actual
//   2 — Actual/360
//   3 — Actual/365
//   4 — European 30/360
//
// `daysInYear(basis, start, end)` returns the denominator used when scaling
// an integer day count to a year fraction. For Actual/Actual we use the
// segment-average that matches YEARFRAC basis 1.

export function daysInYear(basis: number, start: Date, end: Date): number {
  switch (Math.trunc(basis)) {
    case 1: {
      let total = 0;
      let ys = 0;
      for (let y = start.getFullYear(); y <= end.getFullYear(); y++) {
        total += isLeapYear(y) ? 366 : 365;
        ys++;
      }
      return total / Math.max(ys, 1);
    }
    case 3:
      return 365;
    default:
      return 360;
  }
}

function days360(start: Date, end: Date, european: boolean): number {
  let d1 = start.getDate();
  let d2 = end.getDate();
  const m1 = start.getMonth() + 1;
  const m2 = end.getMonth() + 1;
  const y1 = start.getFullYear();
  const y2 = end.getFullYear();
  if (european) {
    if (d1 === 31) d1 = 30;
    if (d2 === 31) d2 = 30;
  } else {
    const isLastFeb = (y: number, m: number, d: number): boolean =>
      m === 2 && d === new Date(y, m, 0).getDate();
    if (isLastFeb(y1, m1, d1) && isLastFeb(y2, m2, d2)) d2 = 30;
    if (isLastFeb(y1, m1, d1)) d1 = 30;
    if (d2 === 31 && d1 >= 30) d2 = 30;
    if (d1 === 31) d1 = 30;
  }
  return 360 * (y2 - y1) + 30 * (m2 - m1) + (d2 - d1);
}

/**
 * Integer day count between two dates under one of the five Excel basis modes.
 * Mirrors the numerator that YEARFRAC produces (without the year denominator).
 */
export function daysByBasis(basis: number, start: Date, end: Date): number {
  switch (Math.trunc(basis)) {
    case 0:
      return days360(start, end, false);
    case 4:
      return days360(start, end, true);
    default:
      return daysBetween(start, end);
  }
}

/**
 * Coupon-period day count tuple: `total` = days in the coupon period
 * containing `settle`, `bs` = days from the period's start to settle,
 * `nc` = days from settle to the next coupon. Mirrors COUPDAYS /
 * COUPDAYBS / COUPDAYSNC.
 *
 * For 30/360 (basis 0, 4) and Actual/360 / Actual/365 (basis 2, 3),
 * `total` is the canonical `E/freq` constant; basis 1 uses real
 * calendar days for the period containing settlement.
 */
export function coupPeriodDays(
  prev: Date,
  next: Date,
  settle: Date,
  basis: number,
  frequency: number,
): { total: number; bs: number; nc: number } {
  const b = Math.trunc(basis);
  let total: number;
  if (b === 0 || b === 4) {
    total = 360 / frequency;
  } else if (b === 2) {
    total = 360 / frequency;
  } else if (b === 3) {
    total = 365 / frequency;
  } else {
    // basis 1 — actual/actual: real calendar days in the coupon period
    total = daysBetween(prev, next);
  }
  const bs = daysByBasis(basis, prev, settle);
  const nc = daysByBasis(basis, settle, next);
  return { total, bs, nc };
}

// ----- Newton's method (used by financial RATE / IRR / XIRR / YIELD) --------

export function newtonRoot(
  f: (r: number) => number,
  guess: number,
  maxIter = 50,
  tol = 1e-10,
): number | FormulaError {
  let r = guess;
  for (let i = 0; i < maxIter; i++) {
    const fr = f(r);
    if (Math.abs(fr) < tol) return r;
    const h = Math.max(Math.abs(r) * 1e-6, 1e-8);
    const slope = (f(r + h) - fr) / h;
    if (slope === 0) return NUM_ERROR;
    const next = r - fr / slope;
    if (!Number.isFinite(next)) return NUM_ERROR;
    if (Math.abs(next - r) < tol) return next;
    r = next;
  }
  return NUM_ERROR;
}

// ----- Conditional-aggregate helpers (used by stats *IF/*IFS) ---------------

export function matchesCriterion(value: unknown, criterion: unknown): boolean {
  if (criterion === null || criterion === undefined) {
    return value === null || value === undefined;
  }
  const cs = typeof criterion === 'string' ? criterion : String(criterion);
  const opMatch = /^(>=|<=|<>|>|<|=)?(.*)$/.exec(cs);
  const op = opMatch?.[1] ?? '=';
  const rhsStr = (opMatch?.[2] ?? '').trim();
  let rhs: unknown = rhsStr;
  if (rhsStr !== '' && Number.isFinite(Number(rhsStr))) rhs = Number(rhsStr);
  switch (op) {
    case '=':
      if (typeof rhs === 'string' && /[*?]/.test(rhs)) {
        const re = new RegExp(
          '^' + rhs.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
          'i',
        );
        return re.test(String(value));
      }
      return compare(value, rhs) === 0;
    case '<>':
      return compare(value, rhs) !== 0;
    case '>':
      return compare(value, rhs) > 0;
    case '<':
      return compare(value, rhs) < 0;
    case '>=':
      return compare(value, rhs) >= 0;
    case '<=':
      return compare(value, rhs) <= 0;
    default:
      return false;
  }
}

export function pairedIf(
  args: ReadonlyArray<unknown>,
  combine: (kept: number[]) => number | FormulaError,
  sumColIdx?: number,
): number | FormulaError {
  const range = args[0];
  const criterion = args[1];
  const valuesRange =
    sumColIdx !== undefined && args[sumColIdx] !== undefined ? args[sumColIdx] : range;
  if (!Array.isArray(range)) return VALUE_ERROR;
  if (!Array.isArray(valuesRange)) return VALUE_ERROR;
  const rangeFlat = (range as unknown[]).flat();
  const valuesFlat = (valuesRange as unknown[]).flat();
  const kept: number[] = [];
  for (let i = 0; i < rangeFlat.length; i++) {
    if (matchesCriterion(rangeFlat[i], criterion)) {
      const n = toNumber(valuesFlat[i] ?? 0);
      if (!isFormulaError(n)) kept.push(n);
    }
  }
  return combine(kept);
}

export function multiIf(
  valuesArg: unknown,
  pairs: ReadonlyArray<unknown>,
  combine: (kept: number[]) => number | FormulaError,
): number | FormulaError {
  if (!Array.isArray(valuesArg)) return VALUE_ERROR;
  const values = (valuesArg as unknown[]).flat();
  if (pairs.length % 2 !== 0) return VALUE_ERROR;
  const ranges: unknown[][] = [];
  const crits: unknown[] = [];
  for (let i = 0; i < pairs.length; i += 2) {
    const r = pairs[i];
    if (!Array.isArray(r)) return VALUE_ERROR;
    ranges.push((r as unknown[]).flat());
    crits.push(pairs[i + 1]);
  }
  for (const r of ranges) {
    if (r.length !== values.length) return VALUE_ERROR;
  }
  const kept: number[] = [];
  for (let i = 0; i < values.length; i++) {
    let ok = true;
    for (let j = 0; j < ranges.length; j++) {
      if (!matchesCriterion(ranges[j]![i], crits[j])) {
        ok = false;
        break;
      }
    }
    if (ok) {
      const n = toNumber(values[i] ?? 0);
      if (!isFormulaError(n)) kept.push(n);
    }
  }
  return combine(kept);
}

// ----- Lookup helpers --------------------------------------------------------

/**
 * Normalize an input to a 2D array of unknowns.
 *   - `unknown[][]` is returned as-is.
 *   - `unknown[]` is treated as a single COLUMN (each element wrapped in its
 *     own row) so 1D and 2D inputs compose under INDEX(row, col).
 *   - Scalar is wrapped as `[[scalar]]`.
 */
export function to2D(v: unknown): unknown[][] {
  if (Array.isArray(v) && v.length > 0 && Array.isArray(v[0])) {
    return v as unknown[][];
  }
  if (Array.isArray(v)) return (v as unknown[]).map((x) => [x]);
  return [[v]];
}

// ----- Function values (wave 16: LAMBDA + higher-order consumers) -----------
//
// A `FormulaFunction` is the runtime representation of a `LAMBDA(p, ..., body)`
// node. It carries the body AST plus the resolver-shaped scope captured at
// construction time, so a lambda passed into BYROW/MAP/REDUCE can still
// resolve cell refs and LET bindings from its lexical context — not from
// the caller's. The `call` thunk is plugged in by the evaluator (so this
// module stays free of an `ast` import cycle) and accepts an arg array.
//
// A reserved string sentinel `__OG_OMITTED__` is what ISOMITTED checks for.
// Higher-order callers pass it for params the user didn't supply.

export const OMITTED = '__OG_OMITTED__' as const;

export type FormulaFunctionTag = '__og_formula_function__';

export interface FormulaFunction {
  readonly __tag: FormulaFunctionTag;
  readonly params: ReadonlyArray<string>;
  /** Invoke the lambda with positional args. */
  readonly call: (args: ReadonlyArray<unknown>) => unknown;
}

export function isFormulaFunction(v: unknown): v is FormulaFunction {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as { __tag?: unknown }).__tag === '__og_formula_function__'
  );
}

export function makeFormulaFunction(
  params: ReadonlyArray<string>,
  call: (args: ReadonlyArray<unknown>) => unknown,
): FormulaFunction {
  return { __tag: '__og_formula_function__', params, call };
}

// ----- Call context sidechannel (wave 14: cell-metadata introspection) ------
//
// A few Excel functions need access to the un-evaluated argument AST or the
// caller's resolver (FORMULATEXT must return the textual form, ISFORMULA /
// ISREF / CELL must distinguish cell references from values). The evaluator
// stashes the active call's nodes here before invoking the function, then
// clears it. Functions that don't read the context simply ignore it.

export type CallContext = {
  readonly argNodes: ReadonlyArray<unknown>; // typed loosely so _shared stays
                                              // free of an `ast` import cycle
  readonly resolver: { readonly getCell: (ref: string) => unknown } | undefined;
};

let activeCallContext: CallContext | undefined;

export function setCallContext(ctx: CallContext | undefined): void {
  activeCallContext = ctx;
}

export function getCallContext(): CallContext | undefined {
  return activeCallContext;
}

export function approxBinarySearch(col: unknown[], target: unknown): number {
  let lo = 0;
  let hi = col.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const cmp = compare(col[mid], target);
    if (cmp === 0) return mid;
    if (cmp < 0) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

