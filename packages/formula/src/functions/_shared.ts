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

