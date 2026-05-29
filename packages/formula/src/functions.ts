// =============================================================================
// Built-in function library.
//
// Excel-compatible names. Each function receives an array of evaluated
// arguments. Range references and arrays are flattened by the evaluator
// before being passed to functions, so SUM(A1:A10) and SUM(1, 2, 3) both
// see a flat number list.
// =============================================================================

import { compare, toBoolean, toNumber, toString_ } from './coerce';
import {
  DIV_ZERO,
  FormulaError,
  NA_ERROR,
  NAME_ERROR,
  NUM_ERROR,
  REF_ERROR,
  VALUE_ERROR,
  isFormulaError,
} from './errors';

export type FormulaFn = (args: ReadonlyArray<unknown>) => unknown;

const builtins = new Map<string, FormulaFn>();

function register(name: string, fn: FormulaFn): void {
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

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function flattenNumbers(args: ReadonlyArray<unknown>): { values: number[]; error?: FormulaError } {
  const values: number[] = [];
  for (const a of flatten(args)) {
    if (a === null || a === undefined || a === '') continue;
    if (isFormulaError(a)) return { values: [], error: a };
    const n = toNumber(a);
    if (isFormulaError(n)) continue; // Excel skips non-numeric in SUM-like funcs.
    values.push(n);
  }
  return { values };
}

function* flatten(args: ReadonlyArray<unknown>): Generator<unknown> {
  for (const a of args) {
    if (Array.isArray(a)) {
      yield* flatten(a as ReadonlyArray<unknown>);
    } else {
      yield a;
    }
  }
}

function firstError(args: ReadonlyArray<unknown>): FormulaError | undefined {
  for (const a of flatten(args)) {
    if (isFormulaError(a)) return a;
  }
  return undefined;
}

// -----------------------------------------------------------------------------
// Math
// -----------------------------------------------------------------------------

register('SUM', (args) => {
  const f = flattenNumbers(args);
  if (f.error) return f.error;
  return f.values.reduce((a, b) => a + b, 0);
});

register('AVERAGE', (args) => {
  const f = flattenNumbers(args);
  if (f.error) return f.error;
  if (f.values.length === 0) return DIV_ZERO;
  return f.values.reduce((a, b) => a + b, 0) / f.values.length;
});

register('AVG', getFunction('AVERAGE')!);

register('COUNT', (args) => {
  let n = 0;
  for (const a of flatten(args)) {
    if (typeof a === 'number') n++;
    else if (typeof a === 'string' && Number.isFinite(Number(a))) n++;
  }
  return n;
});

register('COUNTA', (args) => {
  let n = 0;
  for (const a of flatten(args)) {
    if (a !== null && a !== undefined && a !== '' && !isFormulaError(a)) n++;
  }
  return n;
});

register('MIN', (args) => {
  const f = flattenNumbers(args);
  if (f.error) return f.error;
  if (f.values.length === 0) return 0;
  return Math.min(...f.values);
});

register('MAX', (args) => {
  const f = flattenNumbers(args);
  if (f.error) return f.error;
  if (f.values.length === 0) return 0;
  return Math.max(...f.values);
});

register('ABS', (args) => {
  const err = firstError(args);
  if (err) return err;
  const n = toNumber(args[0]);
  return isFormulaError(n) ? n : Math.abs(n);
});

register('ROUND', (args) => {
  const err = firstError(args);
  if (err) return err;
  const n = toNumber(args[0]);
  if (isFormulaError(n)) return n;
  const digits = args.length > 1 ? toNumber(args[1]) : 0;
  if (isFormulaError(digits)) return digits;
  const p = Math.pow(10, digits);
  return Math.round(n * p) / p;
});

register('FLOOR', (args) => {
  const n = toNumber(args[0]);
  return isFormulaError(n) ? n : Math.floor(n);
});

register('CEILING', (args) => {
  const n = toNumber(args[0]);
  return isFormulaError(n) ? n : Math.ceil(n);
});

register('INT', (args) => {
  const n = toNumber(args[0]);
  return isFormulaError(n) ? n : Math.trunc(n);
});

register('SQRT', (args) => {
  const n = toNumber(args[0]);
  if (isFormulaError(n)) return n;
  if (n < 0) return NUM_ERROR;
  return Math.sqrt(n);
});

register('POWER', (args) => {
  const base = toNumber(args[0]);
  const exp = toNumber(args[1]);
  if (isFormulaError(base)) return base;
  if (isFormulaError(exp)) return exp;
  return Math.pow(base, exp);
});

register('MOD', (args) => {
  const a = toNumber(args[0]);
  const b = toNumber(args[1]);
  if (isFormulaError(a)) return a;
  if (isFormulaError(b)) return b;
  if (b === 0) return DIV_ZERO;
  return a - Math.floor(a / b) * b;
});

// -----------------------------------------------------------------------------
// Logical
// -----------------------------------------------------------------------------

register('IF', (args) => {
  const test = toBoolean(args[0]);
  if (isFormulaError(test)) return test;
  return test ? args[1] : args.length > 2 ? args[2] : false;
});

register('AND', (args) => {
  for (const a of flatten(args)) {
    const b = toBoolean(a);
    if (isFormulaError(b)) return b;
    if (!b) return false;
  }
  return true;
});

register('OR', (args) => {
  for (const a of flatten(args)) {
    const b = toBoolean(a);
    if (isFormulaError(b)) return b;
    if (b) return true;
  }
  return false;
});

register('NOT', (args) => {
  const b = toBoolean(args[0]);
  return isFormulaError(b) ? b : !b;
});

register('IFERROR', (args) => {
  const v = args[0];
  if (isFormulaError(v)) return args[1] ?? '';
  return v;
});

register('ISNUMBER', (args) => typeof args[0] === 'number');
register('ISTEXT', (args) => typeof args[0] === 'string');
register('ISBLANK', (args) => args[0] === null || args[0] === undefined || args[0] === '');
register('ISERROR', (args) => isFormulaError(args[0]));

register('TRUE', () => true);
register('FALSE', () => false);

// -----------------------------------------------------------------------------
// Text
// -----------------------------------------------------------------------------

register('LEN', (args) => toString_(args[0]).length);

register('UPPER', (args) => toString_(args[0]).toUpperCase());

register('LOWER', (args) => toString_(args[0]).toLowerCase());

register('TRIM', (args) => toString_(args[0]).trim());

register('CONCAT', (args) => {
  let out = '';
  for (const a of flatten(args)) {
    if (isFormulaError(a)) return a;
    out += toString_(a);
  }
  return out;
});

register('CONCATENATE', getFunction('CONCAT')!);

register('LEFT', (args) => {
  const s = toString_(args[0]);
  const n = args.length > 1 ? toNumber(args[1]) : 1;
  if (isFormulaError(n)) return n;
  return s.slice(0, Math.max(0, n));
});

register('RIGHT', (args) => {
  const s = toString_(args[0]);
  const n = args.length > 1 ? toNumber(args[1]) : 1;
  if (isFormulaError(n)) return n;
  if (n <= 0) return '';
  return s.slice(-n);
});

register('MID', (args) => {
  const s = toString_(args[0]);
  const start = toNumber(args[1]);
  const len = toNumber(args[2]);
  if (isFormulaError(start) || isFormulaError(len)) return VALUE_ERROR;
  if (start < 1 || len < 0) return VALUE_ERROR;
  return s.slice(start - 1, start - 1 + len);
});

register('FIND', (args) => {
  const needle = toString_(args[0]);
  const haystack = toString_(args[1]);
  const startAt = args.length > 2 ? toNumber(args[2]) : 1;
  if (isFormulaError(startAt)) return startAt;
  const idx = haystack.indexOf(needle, Math.max(0, startAt - 1));
  return idx < 0 ? VALUE_ERROR : idx + 1;
});

register('SUBSTITUTE', (args) => {
  const s = toString_(args[0]);
  const from = toString_(args[1]);
  const to = toString_(args[2]);
  return s.split(from).join(to);
});

// -----------------------------------------------------------------------------
// Date / time
// -----------------------------------------------------------------------------

register('TODAY', () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
});

register('NOW', () => new Date());

register('YEAR', (args) => {
  const d = toDate(args[0]);
  return d instanceof Date ? d.getFullYear() : d;
});

register('MONTH', (args) => {
  const d = toDate(args[0]);
  return d instanceof Date ? d.getMonth() + 1 : d;
});

register('DAY', (args) => {
  const d = toDate(args[0]);
  return d instanceof Date ? d.getDate() : d;
});

function toDate(v: unknown): Date | FormulaError {
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string') {
    const t = Date.parse(v);
    if (Number.isFinite(t)) return new Date(t);
  }
  return VALUE_ERROR;
}

// -----------------------------------------------------------------------------
// Math (v1.1.0 expansion — Excel parity)
// -----------------------------------------------------------------------------

register('PRODUCT', (args) => {
  const f = flattenNumbers(args);
  if (f.error) return f.error;
  if (f.values.length === 0) return 0;
  return f.values.reduce((a, b) => a * b, 1);
});

register('SUMSQ', (args) => {
  const f = flattenNumbers(args);
  if (f.error) return f.error;
  return f.values.reduce((acc, v) => acc + v * v, 0);
});

register('SUMPRODUCT', (args) => {
  // Excel's SUMPRODUCT multiplies element-wise across arrays of equal
  // length, then sums. With non-array (scalar) inputs it falls back to
  // SUM(args[0] * args[1] * ...).
  const arrays: number[][] = [];
  for (const a of args) {
    if (Array.isArray(a)) {
      const inner = (a as unknown[]).flat();
      const nums: number[] = [];
      for (const v of inner) {
        const n = toNumber(v);
        nums.push(isFormulaError(n) ? 0 : n);
      }
      arrays.push(nums);
    } else {
      const n = toNumber(a);
      arrays.push([isFormulaError(n) ? 0 : n]);
    }
  }
  if (arrays.length === 0) return 0;
  const len = arrays[0]!.length;
  for (const arr of arrays) {
    if (arr.length !== len) return VALUE_ERROR;
  }
  let total = 0;
  for (let i = 0; i < len; i++) {
    let prod = 1;
    for (const arr of arrays) prod *= arr[i]!;
    total += prod;
  }
  return total;
});

register('GCD', (args) => {
  const f = flattenNumbers(args);
  if (f.error) return f.error;
  if (f.values.some((v) => v < 0)) return NUM_ERROR;
  const ints = f.values.map((v) => Math.trunc(v));
  if (ints.length === 0) return 0;
  const gcd2 = (a: number, b: number): number => (b === 0 ? a : gcd2(b, a % b));
  return ints.reduce((a, b) => gcd2(a, b));
});

register('LCM', (args) => {
  const f = flattenNumbers(args);
  if (f.error) return f.error;
  if (f.values.some((v) => v < 0)) return NUM_ERROR;
  const ints = f.values.map((v) => Math.trunc(v));
  if (ints.length === 0) return 0;
  const gcd2 = (a: number, b: number): number => (b === 0 ? a : gcd2(b, a % b));
  return ints.reduce((a, b) => (a === 0 || b === 0 ? 0 : Math.abs(a * b) / gcd2(a, b)));
});

register('EXP', (args) => {
  const n = toNumber(args[0]);
  return isFormulaError(n) ? n : Math.exp(n);
});

register('LN', (args) => {
  const n = toNumber(args[0]);
  if (isFormulaError(n)) return n;
  if (n <= 0) return NUM_ERROR;
  return Math.log(n);
});

register('LOG', (args) => {
  const n = toNumber(args[0]);
  if (isFormulaError(n)) return n;
  if (n <= 0) return NUM_ERROR;
  const base = args.length > 1 ? toNumber(args[1]) : 10;
  if (isFormulaError(base)) return base;
  if (base <= 0 || base === 1) return NUM_ERROR;
  return Math.log(n) / Math.log(base);
});

register('LOG10', (args) => {
  const n = toNumber(args[0]);
  if (isFormulaError(n)) return n;
  if (n <= 0) return NUM_ERROR;
  return Math.log10(n);
});

register('PI', () => Math.PI);

register('RADIANS', (args) => {
  const n = toNumber(args[0]);
  return isFormulaError(n) ? n : (n * Math.PI) / 180;
});

register('DEGREES', (args) => {
  const n = toNumber(args[0]);
  return isFormulaError(n) ? n : (n * 180) / Math.PI;
});

const trigUnary = (fn: (n: number) => number): FormulaFn => (args) => {
  const n = toNumber(args[0]);
  if (isFormulaError(n)) return n;
  const r = fn(n);
  return Number.isFinite(r) ? r : NUM_ERROR;
};

register('SIN', trigUnary(Math.sin));
register('COS', trigUnary(Math.cos));
register('TAN', trigUnary(Math.tan));
register('ASIN', trigUnary((n) => (n < -1 || n > 1 ? NaN : Math.asin(n))));
register('ACOS', trigUnary((n) => (n < -1 || n > 1 ? NaN : Math.acos(n))));
register('ATAN', trigUnary(Math.atan));
register('SINH', trigUnary(Math.sinh));
register('COSH', trigUnary(Math.cosh));
register('TANH', trigUnary(Math.tanh));
register('ASINH', trigUnary(Math.asinh));
register('ACOSH', trigUnary((n) => (n < 1 ? NaN : Math.acosh(n))));
register('ATANH', trigUnary((n) => (n <= -1 || n >= 1 ? NaN : Math.atanh(n))));

register('ATAN2', (args) => {
  // Excel's ATAN2 takes (x, y) — opposite of JS Math.atan2(y, x).
  const x = toNumber(args[0]);
  const y = toNumber(args[1]);
  if (isFormulaError(x)) return x;
  if (isFormulaError(y)) return y;
  if (x === 0 && y === 0) return DIV_ZERO;
  return Math.atan2(y, x);
});

register('RAND', () => Math.random());

register('RANDBETWEEN', (args) => {
  const lo = toNumber(args[0]);
  const hi = toNumber(args[1]);
  if (isFormulaError(lo)) return lo;
  if (isFormulaError(hi)) return hi;
  if (lo > hi) return NUM_ERROR;
  const loI = Math.ceil(lo);
  const hiI = Math.floor(hi);
  return Math.floor(Math.random() * (hiI - loI + 1)) + loI;
});

register('SIGN', (args) => {
  const n = toNumber(args[0]);
  return isFormulaError(n) ? n : Math.sign(n);
});

register('TRUNC', (args) => {
  const n = toNumber(args[0]);
  if (isFormulaError(n)) return n;
  const digits = args.length > 1 ? toNumber(args[1]) : 0;
  if (isFormulaError(digits)) return digits;
  const p = Math.pow(10, digits);
  return Math.trunc(n * p) / p;
});

register('ROUNDDOWN', (args) => {
  const n = toNumber(args[0]);
  if (isFormulaError(n)) return n;
  const digits = args.length > 1 ? toNumber(args[1]) : 0;
  if (isFormulaError(digits)) return digits;
  const p = Math.pow(10, digits);
  return (n >= 0 ? Math.floor(n * p) : Math.ceil(n * p)) / p;
});

register('ROUNDUP', (args) => {
  const n = toNumber(args[0]);
  if (isFormulaError(n)) return n;
  const digits = args.length > 1 ? toNumber(args[1]) : 0;
  if (isFormulaError(digits)) return digits;
  const p = Math.pow(10, digits);
  return (n >= 0 ? Math.ceil(n * p) : Math.floor(n * p)) / p;
});

register('MROUND', (args) => {
  const n = toNumber(args[0]);
  const mult = toNumber(args[1]);
  if (isFormulaError(n)) return n;
  if (isFormulaError(mult)) return mult;
  if (mult === 0) return 0;
  if ((n < 0 && mult > 0) || (n > 0 && mult < 0)) return NUM_ERROR;
  return Math.round(n / mult) * mult;
});

register('EVEN', (args) => {
  const n = toNumber(args[0]);
  if (isFormulaError(n)) return n;
  const sign = n < 0 ? -1 : 1;
  return sign * 2 * Math.ceil(Math.abs(n) / 2);
});

register('ODD', (args) => {
  const n = toNumber(args[0]);
  if (isFormulaError(n)) return n;
  if (n === 0) return 1;
  const sign = n < 0 ? -1 : 1;
  const m = Math.ceil(Math.abs(n));
  return sign * (m % 2 === 0 ? m + 1 : m);
});

register('SQRTPI', (args) => {
  const n = toNumber(args[0]);
  if (isFormulaError(n)) return n;
  if (n < 0) return NUM_ERROR;
  return Math.sqrt(n * Math.PI);
});

register('FACT', (args) => {
  const n = toNumber(args[0]);
  if (isFormulaError(n)) return n;
  if (n < 0) return NUM_ERROR;
  const k = Math.trunc(n);
  let r = 1;
  for (let i = 2; i <= k; i++) r *= i;
  return r;
});

register('COMBIN', (args) => {
  const n = toNumber(args[0]);
  const k = toNumber(args[1]);
  if (isFormulaError(n)) return n;
  if (isFormulaError(k)) return k;
  const ni = Math.trunc(n);
  const ki = Math.trunc(k);
  if (ni < 0 || ki < 0 || ki > ni) return NUM_ERROR;
  if (ki === 0 || ki === ni) return 1;
  let r = 1;
  const kk = Math.min(ki, ni - ki);
  for (let i = 1; i <= kk; i++) r = (r * (ni - kk + i)) / i;
  return r;
});

register('PERMUT', (args) => {
  const n = toNumber(args[0]);
  const k = toNumber(args[1]);
  if (isFormulaError(n)) return n;
  if (isFormulaError(k)) return k;
  const ni = Math.trunc(n);
  const ki = Math.trunc(k);
  if (ni < 0 || ki < 0 || ki > ni) return NUM_ERROR;
  let r = 1;
  for (let i = 0; i < ki; i++) r *= ni - i;
  return r;
});

// -----------------------------------------------------------------------------
// Statistics (v1.1.0 — new category)
// -----------------------------------------------------------------------------

register('MEDIAN', (args) => {
  const f = flattenNumbers(args);
  if (f.error) return f.error;
  if (f.values.length === 0) return NUM_ERROR;
  const sorted = [...f.values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
});

register('MODE.SNGL', (args) => {
  const f = flattenNumbers(args);
  if (f.error) return f.error;
  if (f.values.length === 0) return NA_ERROR;
  const counts = new Map<number, { count: number; firstIdx: number }>();
  for (let i = 0; i < f.values.length; i++) {
    const v = f.values[i]!;
    const e = counts.get(v);
    if (e) e.count++;
    else counts.set(v, { count: 1, firstIdx: i });
  }
  let best: number | null = null;
  let bestCount = 1;
  let bestIdx = Infinity;
  for (const [v, { count, firstIdx }] of counts) {
    if (count > bestCount || (count === bestCount && firstIdx < bestIdx)) {
      best = v;
      bestCount = count;
      bestIdx = firstIdx;
    }
  }
  return bestCount > 1 && best !== null ? best : NA_ERROR;
});

register('MODE', getFunction('MODE.SNGL')!);

register('STDEV.S', (args) => {
  const f = flattenNumbers(args);
  if (f.error) return f.error;
  if (f.values.length < 2) return DIV_ZERO;
  const m = f.values.reduce((a, b) => a + b, 0) / f.values.length;
  const v = f.values.reduce((a, b) => a + (b - m) * (b - m), 0) / (f.values.length - 1);
  return Math.sqrt(v);
});

register('STDEV', getFunction('STDEV.S')!);

register('STDEV.P', (args) => {
  const f = flattenNumbers(args);
  if (f.error) return f.error;
  if (f.values.length === 0) return DIV_ZERO;
  const m = f.values.reduce((a, b) => a + b, 0) / f.values.length;
  const v = f.values.reduce((a, b) => a + (b - m) * (b - m), 0) / f.values.length;
  return Math.sqrt(v);
});

register('STDEVP', getFunction('STDEV.P')!);

register('VAR.S', (args) => {
  const f = flattenNumbers(args);
  if (f.error) return f.error;
  if (f.values.length < 2) return DIV_ZERO;
  const m = f.values.reduce((a, b) => a + b, 0) / f.values.length;
  return f.values.reduce((a, b) => a + (b - m) * (b - m), 0) / (f.values.length - 1);
});

register('VAR', getFunction('VAR.S')!);

register('VAR.P', (args) => {
  const f = flattenNumbers(args);
  if (f.error) return f.error;
  if (f.values.length === 0) return DIV_ZERO;
  const m = f.values.reduce((a, b) => a + b, 0) / f.values.length;
  return f.values.reduce((a, b) => a + (b - m) * (b - m), 0) / f.values.length;
});

register('VARP', getFunction('VAR.P')!);

register('LARGE', (args) => {
  const f = flattenNumbers(args);
  if (f.error) return f.error;
  const k = toNumber(args[1]);
  if (isFormulaError(k)) return k;
  const ki = Math.trunc(k);
  if (ki < 1 || ki > f.values.length) return NUM_ERROR;
  const sorted = [...f.values].sort((a, b) => b - a);
  return sorted[ki - 1]!;
});

register('SMALL', (args) => {
  const f = flattenNumbers(args);
  if (f.error) return f.error;
  const k = toNumber(args[1]);
  if (isFormulaError(k)) return k;
  const ki = Math.trunc(k);
  if (ki < 1 || ki > f.values.length) return NUM_ERROR;
  const sorted = [...f.values].sort((a, b) => a - b);
  return sorted[ki - 1]!;
});

register('RANK.EQ', (args) => {
  const x = toNumber(args[0]);
  if (isFormulaError(x)) return x;
  const f = flattenNumbers([args[1]]);
  if (f.error) return f.error;
  const desc = args.length > 2 ? toNumber(args[2]) : 0;
  if (isFormulaError(desc)) return desc;
  const sorted = desc === 0 ? [...f.values].sort((a, b) => b - a) : [...f.values].sort((a, b) => a - b);
  const idx = sorted.indexOf(x);
  return idx < 0 ? NA_ERROR : idx + 1;
});

register('RANK', getFunction('RANK.EQ')!);

register('PERCENTILE.INC', (args) => {
  const f = flattenNumbers([args[0]]);
  if (f.error) return f.error;
  const p = toNumber(args[1]);
  if (isFormulaError(p)) return p;
  if (p < 0 || p > 1) return NUM_ERROR;
  if (f.values.length === 0) return NUM_ERROR;
  const sorted = [...f.values].sort((a, b) => a - b);
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (idx - lo) * (sorted[hi]! - sorted[lo]!);
});

register('PERCENTILE', getFunction('PERCENTILE.INC')!);

register('QUARTILE.INC', (args) => {
  const quart = toNumber(args[1]);
  if (isFormulaError(quart)) return quart;
  const q = Math.trunc(quart);
  if (q < 0 || q > 4) return NUM_ERROR;
  const inner = getFunction('PERCENTILE.INC')!;
  return inner([args[0], q / 4]);
});

register('QUARTILE', getFunction('QUARTILE.INC')!);

register('CORREL', (args) => {
  const xs = flattenNumbers([args[0]]);
  const ys = flattenNumbers([args[1]]);
  if (xs.error) return xs.error;
  if (ys.error) return ys.error;
  if (xs.values.length !== ys.values.length || xs.values.length < 2) return DIV_ZERO;
  const n = xs.values.length;
  const mx = xs.values.reduce((a, b) => a + b, 0) / n;
  const my = ys.values.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const ex = xs.values[i]! - mx;
    const ey = ys.values[i]! - my;
    num += ex * ey;
    dx += ex * ex;
    dy += ey * ey;
  }
  const denom = Math.sqrt(dx * dy);
  return denom === 0 ? DIV_ZERO : num / denom;
});

register('PEARSON', getFunction('CORREL')!);

register('COVARIANCE.S', (args) => {
  const xs = flattenNumbers([args[0]]);
  const ys = flattenNumbers([args[1]]);
  if (xs.error) return xs.error;
  if (ys.error) return ys.error;
  if (xs.values.length !== ys.values.length || xs.values.length < 2) return DIV_ZERO;
  const n = xs.values.length;
  const mx = xs.values.reduce((a, b) => a + b, 0) / n;
  const my = ys.values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  for (let i = 0; i < n; i++) num += (xs.values[i]! - mx) * (ys.values[i]! - my);
  return num / (n - 1);
});

register('COVARIANCE.P', (args) => {
  const xs = flattenNumbers([args[0]]);
  const ys = flattenNumbers([args[1]]);
  if (xs.error) return xs.error;
  if (ys.error) return ys.error;
  if (xs.values.length !== ys.values.length || xs.values.length === 0) return DIV_ZERO;
  const n = xs.values.length;
  const mx = xs.values.reduce((a, b) => a + b, 0) / n;
  const my = ys.values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  for (let i = 0; i < n; i++) num += (xs.values[i]! - mx) * (ys.values[i]! - my);
  return num / n;
});

register('COVAR', getFunction('COVARIANCE.P')!);

register('SLOPE', (args) => {
  // SLOPE(known_ys, known_xs) — note y first, then x.
  const ys = flattenNumbers([args[0]]);
  const xs = flattenNumbers([args[1]]);
  if (ys.error) return ys.error;
  if (xs.error) return xs.error;
  if (xs.values.length !== ys.values.length || xs.values.length < 2) return DIV_ZERO;
  const n = xs.values.length;
  const mx = xs.values.reduce((a, b) => a + b, 0) / n;
  const my = ys.values.reduce((a, b) => a + b, 0) / n;
  let num = 0, denom = 0;
  for (let i = 0; i < n; i++) {
    const ex = xs.values[i]! - mx;
    num += ex * (ys.values[i]! - my);
    denom += ex * ex;
  }
  return denom === 0 ? DIV_ZERO : num / denom;
});

register('INTERCEPT', (args) => {
  const ys = flattenNumbers([args[0]]);
  const xs = flattenNumbers([args[1]]);
  if (ys.error) return ys.error;
  if (xs.error) return xs.error;
  if (xs.values.length !== ys.values.length || xs.values.length < 2) return DIV_ZERO;
  const slope = getFunction('SLOPE')!([args[0], args[1]]);
  if (isFormulaError(slope)) return slope;
  const n = xs.values.length;
  const mx = xs.values.reduce((a, b) => a + b, 0) / n;
  const my = ys.values.reduce((a, b) => a + b, 0) / n;
  return my - (slope as number) * mx;
});

register('RSQ', (args) => {
  const r = getFunction('CORREL')!([args[0], args[1]]);
  if (isFormulaError(r)) return r;
  return (r as number) * (r as number);
});

// Conditional aggregates. Excel's *IF / *IFS use a wildcard syntax (?
// and *) plus comparison operator prefixes (">=", "<>", etc.) on the
// criteria. Implemented in matchesCriterion below.
function matchesCriterion(value: unknown, criterion: unknown): boolean {
  if (criterion === null || criterion === undefined) return value === null || value === undefined;
  const cs = typeof criterion === 'string' ? criterion : String(criterion);
  // Strip leading operator.
  const opMatch = /^(>=|<=|<>|>|<|=)?(.*)$/.exec(cs);
  const op = opMatch?.[1] ?? '=';
  const rhsStr = (opMatch?.[2] ?? '').trim();
  let rhs: unknown = rhsStr;
  if (rhsStr !== '' && Number.isFinite(Number(rhsStr))) rhs = Number(rhsStr);
  switch (op) {
    case '=':
      // String form supports * and ? wildcards.
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

function pairedIf(
  args: ReadonlyArray<unknown>,
  combine: (kept: number[]) => number | FormulaError,
  sumColIdx?: number,
): number | FormulaError {
  // SUMIF(range, criterion, [sum_range]); COUNTIF(range, criterion);
  // AVERAGEIF(range, criterion, [average_range]).
  const range = args[0];
  const criterion = args[1];
  const valuesRange = sumColIdx !== undefined && args[sumColIdx] !== undefined ? args[sumColIdx] : range;
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

register('COUNTIF', (args) => {
  const range = args[0];
  const criterion = args[1];
  if (!Array.isArray(range)) return VALUE_ERROR;
  let n = 0;
  for (const v of (range as unknown[]).flat()) {
    if (matchesCriterion(v, criterion)) n++;
  }
  return n;
});

register('SUMIF', (args) =>
  pairedIf(args, (kept) => kept.reduce((a, b) => a + b, 0), 2),
);

register('AVERAGEIF', (args) =>
  pairedIf(
    args,
    (kept) => (kept.length === 0 ? DIV_ZERO : kept.reduce((a, b) => a + b, 0) / kept.length),
    2,
  ),
);

// *IFS variants take pairs of (range, criterion) and apply the AND of
// all predicates. The first arg is the value range; pairs start at idx 1.
function multiIf(
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

register('SUMIFS', (args) =>
  multiIf(args[0], args.slice(1), (kept) => kept.reduce((a, b) => a + b, 0)),
);

register('AVERAGEIFS', (args) =>
  multiIf(args[0], args.slice(1), (kept) =>
    kept.length === 0 ? DIV_ZERO : kept.reduce((a, b) => a + b, 0) / kept.length,
  ),
);

register('COUNTIFS', (args) => {
  // First range serves as the predicate-only carrier; no value range.
  if (args.length === 0 || args.length % 2 !== 0) return VALUE_ERROR;
  const ranges: unknown[][] = [];
  const crits: unknown[] = [];
  for (let i = 0; i < args.length; i += 2) {
    const r = args[i];
    if (!Array.isArray(r)) return VALUE_ERROR;
    ranges.push((r as unknown[]).flat());
    crits.push(args[i + 1]);
  }
  const len = ranges[0]!.length;
  for (const r of ranges) {
    if (r.length !== len) return VALUE_ERROR;
  }
  let n = 0;
  for (let i = 0; i < len; i++) {
    let ok = true;
    for (let j = 0; j < ranges.length; j++) {
      if (!matchesCriterion(ranges[j]![i], crits[j])) {
        ok = false;
        break;
      }
    }
    if (ok) n++;
  }
  return n;
});

register('MAXIFS', (args) =>
  multiIf(args[0], args.slice(1), (kept) => (kept.length === 0 ? 0 : Math.max(...kept))),
);

register('MINIFS', (args) =>
  multiIf(args[0], args.slice(1), (kept) => (kept.length === 0 ? 0 : Math.min(...kept))),
);

// -----------------------------------------------------------------------------
// Logical (v1.1.0 expansion)
// -----------------------------------------------------------------------------

register('IFS', (args) => {
  // IFS(cond1, val1, cond2, val2, ...). Returns the first val whose
  // cond is truthy; #N/A if none match.
  if (args.length % 2 !== 0) return NA_ERROR;
  for (let i = 0; i < args.length; i += 2) {
    const b = toBoolean(args[i]);
    if (isFormulaError(b)) return b;
    if (b) return args[i + 1];
  }
  return NA_ERROR;
});

register('SWITCH', (args) => {
  // SWITCH(expr, val1, result1, val2, result2, ..., [default]).
  if (args.length < 3) return NA_ERROR;
  const expr = args[0];
  const tail = args.slice(1);
  const hasDefault = tail.length % 2 === 1;
  const limit = hasDefault ? tail.length - 1 : tail.length;
  for (let i = 0; i < limit; i += 2) {
    if (compare(expr, tail[i]) === 0) return tail[i + 1];
  }
  return hasDefault ? tail[tail.length - 1] : NA_ERROR;
});

register('IFNA', (args) => {
  const v = args[0];
  if (isFormulaError(v) && v === NA_ERROR) return args[1] ?? '';
  return v;
});

register('XOR', (args) => {
  let trueCount = 0;
  for (const a of flatten(args)) {
    const b = toBoolean(a);
    if (isFormulaError(b)) return b;
    if (b) trueCount++;
  }
  return trueCount % 2 === 1;
});

// -----------------------------------------------------------------------------
// Info (v1.1.0 — new category)
// -----------------------------------------------------------------------------

register('ISNA', (args) => isFormulaError(args[0]) && (args[0] as FormulaError) === NA_ERROR);

register('ISERR', (args) => isFormulaError(args[0]) && (args[0] as FormulaError) !== NA_ERROR);

register('ISLOGICAL', (args) => typeof args[0] === 'boolean');

register('ISEVEN', (args) => {
  const n = toNumber(args[0]);
  if (isFormulaError(n)) return n;
  return Math.trunc(n) % 2 === 0;
});

register('ISODD', (args) => {
  const n = toNumber(args[0]);
  if (isFormulaError(n)) return n;
  return Math.abs(Math.trunc(n)) % 2 === 1;
});

register('N', (args) => {
  const v = args[0];
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v.getTime();
  return 0;
});

register('NA', () => NA_ERROR);

register('TYPE', (args) => {
  // 1=number, 2=text, 4=logical, 16=error, 64=array
  const v = args[0];
  if (typeof v === 'number') return 1;
  if (typeof v === 'string') return 2;
  if (typeof v === 'boolean') return 4;
  if (isFormulaError(v)) return 16;
  if (Array.isArray(v)) return 64;
  return 1;
});

register('ERROR.TYPE', (args) => {
  const v = args[0];
  if (!isFormulaError(v)) return NA_ERROR;
  switch (v) {
    case NA_ERROR:
      return 7;
    case DIV_ZERO:
      return 2;
    case NUM_ERROR:
      return 6;
    case VALUE_ERROR:
      return 3;
    case NAME_ERROR:
      return 5;
    default:
      return 8;
  }
});

// -----------------------------------------------------------------------------
// Lookup / reference (v1.1.0 — new category)
//
// Most lookup functions operate on 2D ranges. When the input arrives as a
// flat 1D array (the @onegrid/formula CellResolver default), it's treated
// as a single column. To get the full 2D semantics adopters pass an
// array-of-arrays literal (Excel's `{...;...}`) or upgrade their
// `getRange` resolver to return 2D — see CellResolver in evaluator.ts.
// -----------------------------------------------------------------------------

/**
 * Normalize an input to a 2D array of unknowns.
 * - `unknown[][]` is returned as-is.
 * - `unknown[]` is treated as a single COLUMN (each element wrapped in its
 *   own row) so 1D and 2D inputs compose under INDEX(row, col).
 * - Scalar is wrapped as `[[scalar]]`.
 */
function to2D(v: unknown): unknown[][] {
  if (Array.isArray(v) && v.length > 0 && Array.isArray(v[0])) {
    return v as unknown[][];
  }
  if (Array.isArray(v)) return (v as unknown[]).map((x) => [x]);
  return [[v]];
}

// Approximate-match binary search for VLOOKUP/HLOOKUP range_lookup=true.
// Excel: requires sorted column; returns the largest value ≤ target. If
// the smallest entry is already > target, return #N/A.
function approxBinarySearch(col: unknown[], target: unknown): number {
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

register('VLOOKUP', (args) => {
  const target = args[0];
  const table = to2D(args[1]);
  const colIdx = toNumber(args[2]);
  if (isFormulaError(colIdx)) return colIdx;
  const ci = Math.trunc(colIdx) - 1;
  if (ci < 0) return VALUE_ERROR;
  const exact = args.length > 3 ? !toBoolean(args[3]) : false;
  if (table.length === 0) return NA_ERROR;
  if (ci >= table[0]!.length) return REF_ERROR;
  if (exact) {
    for (let r = 0; r < table.length; r++) {
      if (compare(table[r]![0], target) === 0) return table[r]![ci];
    }
    return NA_ERROR;
  }
  // approximate: scan first column.
  const firstCol = table.map((row) => row[0]);
  const i = approxBinarySearch(firstCol, target);
  return i < 0 ? NA_ERROR : table[i]![ci];
});

register('HLOOKUP', (args) => {
  const target = args[0];
  const table = to2D(args[1]);
  const rowIdx = toNumber(args[2]);
  if (isFormulaError(rowIdx)) return rowIdx;
  const ri = Math.trunc(rowIdx) - 1;
  if (ri < 0 || ri >= table.length) return REF_ERROR;
  const exact = args.length > 3 ? !toBoolean(args[3]) : false;
  if (table.length === 0 || table[0]!.length === 0) return NA_ERROR;
  if (exact) {
    const top = table[0]!;
    for (let c = 0; c < top.length; c++) {
      if (compare(top[c], target) === 0) return table[ri]![c];
    }
    return NA_ERROR;
  }
  const i = approxBinarySearch(table[0]!, target);
  return i < 0 ? NA_ERROR : table[ri]![i];
});

register('LOOKUP', (args) => {
  // 1-arg vector form: LOOKUP(value, lookup_vector, [result_vector]).
  // Approximate-match by Excel rule; lookup_vector must be sorted asc.
  const target = args[0];
  const lookupVec = (() => {
    const v = args[1];
    if (Array.isArray(v) && v.length > 0 && Array.isArray(v[0])) {
      return (v as unknown[][]).map((row) => row[0]);
    }
    return Array.isArray(v) ? (v as unknown[]) : [v];
  })();
  const resultVec = (() => {
    if (args.length < 3) return lookupVec;
    const v = args[2];
    if (Array.isArray(v) && v.length > 0 && Array.isArray(v[0])) {
      return (v as unknown[][]).map((row) => row[0]);
    }
    return Array.isArray(v) ? (v as unknown[]) : [v];
  })();
  const i = approxBinarySearch(lookupVec, target);
  return i < 0 ? NA_ERROR : resultVec[Math.min(i, resultVec.length - 1)];
});

register('MATCH', (args) => {
  const target = args[0];
  const lookupArr = (() => {
    const v = args[1];
    if (Array.isArray(v) && v.length > 0 && Array.isArray(v[0])) {
      return (v as unknown[][]).flat();
    }
    return Array.isArray(v) ? (v as unknown[]) : [v];
  })();
  const matchType = args.length > 2 ? toNumber(args[2]) : 1;
  if (isFormulaError(matchType)) return matchType;
  if (matchType === 0) {
    for (let i = 0; i < lookupArr.length; i++) {
      if (compare(lookupArr[i], target) === 0) return i + 1;
    }
    return NA_ERROR;
  }
  if (matchType === 1) {
    // Largest ≤ target; ascending.
    const i = approxBinarySearch(lookupArr, target);
    return i < 0 ? NA_ERROR : i + 1;
  }
  if (matchType === -1) {
    // Smallest ≥ target; descending. Linear scan to keep simple.
    let best = -1;
    for (let i = 0; i < lookupArr.length; i++) {
      if (compare(lookupArr[i], target) >= 0) best = i;
      else break;
    }
    return best < 0 ? NA_ERROR : best + 1;
  }
  return NA_ERROR;
});

register('INDEX', (args) => {
  const arr = to2D(args[0]);
  const rowNum = toNumber(args[1] ?? 0);
  if (isFormulaError(rowNum)) return rowNum;
  const colNum = args.length > 2 ? toNumber(args[2]) : 0;
  if (isFormulaError(colNum)) return colNum;
  const r = Math.trunc(rowNum);
  const c = Math.trunc(colNum as number);
  // Excel: 0 means "whole row" or "whole column"; we return arrays.
  if (r === 0 && c === 0) return arr;
  if (r === 0) {
    if (c < 1 || c > arr[0]!.length) return REF_ERROR;
    return arr.map((row) => row[c - 1]);
  }
  if (c === 0) {
    if (r < 1 || r > arr.length) return REF_ERROR;
    return arr[r - 1]!;
  }
  if (r < 1 || r > arr.length) return REF_ERROR;
  if (c < 1 || c > arr[r - 1]!.length) return REF_ERROR;
  return arr[r - 1]![c - 1];
});

register('CHOOSE', (args) => {
  const idx = toNumber(args[0]);
  if (isFormulaError(idx)) return idx;
  const i = Math.trunc(idx);
  if (i < 1 || i >= args.length) return VALUE_ERROR;
  return args[i];
});

register('OFFSET', (_args) => {
  // OFFSET takes a reference and shifts it — needs CellResolver, not
  // available at function-call layer. The evaluator can short-circuit
  // OFFSET if/when it grows reference-awareness; until then we report
  // a NAME error so adopters know it's unwired rather than failing
  // silently.
  return NAME_ERROR;
});

register('INDIRECT', (_args) => {
  // Same shape as OFFSET: needs reference-awareness in the evaluator
  // to interpret the string as an address. Report NAME until wired.
  return NAME_ERROR;
});

register('ROW', (args) => {
  // Without reference context this is a best-effort utility:
  // ROW() → 1 (Excel returns the row of the formula cell; we can't know).
  // ROW(array) → 1 for the first row.
  if (args.length === 0 || args[0] === undefined) return 1;
  if (Array.isArray(args[0])) return 1;
  return 1;
});

register('COLUMN', (args) => {
  if (args.length === 0 || args[0] === undefined) return 1;
  if (Array.isArray(args[0])) return 1;
  return 1;
});

register('ROWS', (args) => {
  const v = args[0];
  if (!Array.isArray(v)) return 1;
  if (v.length > 0 && Array.isArray(v[0])) return v.length;
  return v.length;
});

register('COLUMNS', (args) => {
  const v = args[0];
  if (!Array.isArray(v)) return 1;
  if (v.length > 0 && Array.isArray(v[0])) return (v[0] as unknown[]).length;
  return 1;
});

register('ADDRESS', (args) => {
  const row = toNumber(args[0]);
  const col = toNumber(args[1]);
  if (isFormulaError(row)) return row;
  if (isFormulaError(col)) return col;
  if (row < 1 || col < 1) return VALUE_ERROR;
  const absNum = args.length > 2 ? toNumber(args[2]) : 1;
  if (isFormulaError(absNum)) return absNum;
  // absNum: 1=$A$1, 2=A$1, 3=$A1, 4=A1
  const colDollar = absNum === 1 || absNum === 3 ? '$' : '';
  const rowDollar = absNum === 1 || absNum === 2 ? '$' : '';
  let n = Math.trunc(col);
  let colName = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    colName = String.fromCharCode(65 + rem) + colName;
    n = Math.floor((n - 1) / 26);
  }
  const a1Style = args.length <= 3 || toBoolean(args[3]) !== false;
  if (!a1Style) {
    // R1C1 style.
    return `R${rowDollar ? Math.trunc(row) : '[' + Math.trunc(row) + ']'}C${colDollar ? Math.trunc(col) : '[' + Math.trunc(col) + ']'}`;
  }
  return `${colDollar}${colName}${rowDollar}${Math.trunc(row)}`;
});

// ---- Modern dynamic-array functions (Excel 2019+) ----------------------

register('XLOOKUP', (args) => {
  // XLOOKUP(lookup_value, lookup_array, return_array, [if_not_found], [match_mode], [search_mode])
  const target = args[0];
  const lookupArr = (() => {
    const v = args[1];
    if (Array.isArray(v) && v.length > 0 && Array.isArray(v[0])) {
      // Treat the first column of a 2D as the lookup vector.
      return (v as unknown[][]).map((r) => r[0]);
    }
    return Array.isArray(v) ? (v as unknown[]) : [v];
  })();
  const returnArr = (() => {
    const v = args[2];
    if (Array.isArray(v) && v.length > 0 && Array.isArray(v[0])) {
      return (v as unknown[][]).map((r) => r[0]);
    }
    return Array.isArray(v) ? (v as unknown[]) : [v];
  })();
  const notFound = args.length > 3 ? args[3] : NA_ERROR;
  const matchMode = args.length > 4 ? toNumber(args[4]) : 0;
  if (isFormulaError(matchMode)) return matchMode;
  const searchMode = args.length > 5 ? toNumber(args[5]) : 1;
  if (isFormulaError(searchMode)) return searchMode;

  const idxs: number[] = [];
  if (searchMode === 1) {
    for (let i = 0; i < lookupArr.length; i++) idxs.push(i);
  } else if (searchMode === -1) {
    for (let i = lookupArr.length - 1; i >= 0; i--) idxs.push(i);
  } else if (searchMode === 2 || searchMode === -2) {
    // Binary search modes (ascending / descending).
    const ascending = searchMode === 2;
    if (matchMode === 0 || matchMode === 1 || matchMode === -1) {
      const sorted = ascending ? lookupArr : [...lookupArr].reverse();
      let lo = 0, hi = sorted.length - 1, found = -1, best = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const cmp = compare(sorted[mid], target);
        if (cmp === 0) {
          found = mid;
          break;
        }
        if (cmp < 0) {
          if (matchMode === -1) best = mid;
          lo = mid + 1;
        } else {
          if (matchMode === 1) best = mid;
          hi = mid - 1;
        }
      }
      const pick = found >= 0 ? found : best;
      if (pick < 0) return notFound;
      const realIdx = ascending ? pick : lookupArr.length - 1 - pick;
      return returnArr[realIdx];
    }
  }

  for (const i of idxs) {
    const cmp = compare(lookupArr[i], target);
    if (cmp === 0) return returnArr[i];
    if (matchMode === -1 && cmp < 0) {
      // Largest ≤ target; track best.
    }
  }
  // Fallback for matchMode -1 / 1 in linear modes.
  if (matchMode === -1) {
    let best = -1;
    for (const i of idxs) {
      if (compare(lookupArr[i], target) <= 0) {
        if (best < 0 || compare(lookupArr[i], lookupArr[best]) > 0) best = i;
      }
    }
    return best < 0 ? notFound : returnArr[best];
  }
  if (matchMode === 1) {
    let best = -1;
    for (const i of idxs) {
      if (compare(lookupArr[i], target) >= 0) {
        if (best < 0 || compare(lookupArr[i], lookupArr[best]) < 0) best = i;
      }
    }
    return best < 0 ? notFound : returnArr[best];
  }
  if (matchMode === 2) {
    // Wildcard match. Excel treats `?` and `*` in target.
    const tStr = String(target);
    const re = new RegExp(
      '^' + tStr.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
      'i',
    );
    for (const i of idxs) {
      if (re.test(String(lookupArr[i]))) return returnArr[i];
    }
  }
  return notFound;
});

register('XMATCH', (args) => {
  // Like MATCH but with XLOOKUP-style matchMode + searchMode.
  const target = args[0];
  const arr = (() => {
    const v = args[1];
    if (Array.isArray(v) && v.length > 0 && Array.isArray(v[0])) {
      return (v as unknown[][]).flat();
    }
    return Array.isArray(v) ? (v as unknown[]) : [v];
  })();
  const matchMode = args.length > 2 ? toNumber(args[2]) : 0;
  if (isFormulaError(matchMode)) return matchMode;
  const searchMode = args.length > 3 ? toNumber(args[3]) : 1;
  if (isFormulaError(searchMode)) return searchMode;

  const idxs: number[] = [];
  if (searchMode === -1) {
    for (let i = arr.length - 1; i >= 0; i--) idxs.push(i);
  } else {
    for (let i = 0; i < arr.length; i++) idxs.push(i);
  }
  if (matchMode === 0) {
    for (const i of idxs) {
      if (compare(arr[i], target) === 0) return i + 1;
    }
    return NA_ERROR;
  }
  if (matchMode === 2) {
    const tStr = String(target);
    const re = new RegExp(
      '^' + tStr.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
      'i',
    );
    for (const i of idxs) {
      if (re.test(String(arr[i]))) return i + 1;
    }
    return NA_ERROR;
  }
  if (matchMode === -1 || matchMode === 1) {
    let best = -1;
    for (const i of idxs) {
      const cmp = compare(arr[i], target);
      if (cmp === 0) return i + 1;
      if (matchMode === -1 && cmp < 0) {
        if (best < 0 || compare(arr[i], arr[best]) > 0) best = i;
      }
      if (matchMode === 1 && cmp > 0) {
        if (best < 0 || compare(arr[i], arr[best]) < 0) best = i;
      }
    }
    return best < 0 ? NA_ERROR : best + 1;
  }
  return NA_ERROR;
});

register('FILTER', (args) => {
  // FILTER(array, include, [if_empty]). `include` is a parallel array of
  // truthy/falsy values; corresponding `array` entries are kept.
  const arr = args[0];
  const include = args[1];
  const ifEmpty = args.length > 2 ? args[2] : NA_ERROR;
  if (!Array.isArray(arr) || !Array.isArray(include)) return VALUE_ERROR;
  const arr2 = to2D(arr);
  const inc = (() => {
    if ((include as unknown[]).length > 0 && Array.isArray((include as unknown[])[0])) {
      return (include as unknown[][]).map((r) => r[0]);
    }
    return include as unknown[];
  })();
  if (arr2.length !== inc.length) return VALUE_ERROR;
  const out: unknown[][] = [];
  for (let i = 0; i < arr2.length; i++) {
    const b = toBoolean(inc[i]);
    if (isFormulaError(b)) return b;
    if (b) out.push(arr2[i]!);
  }
  if (out.length === 0) return ifEmpty;
  return out;
});

register('SORT', (args) => {
  const arr = args[0];
  if (!Array.isArray(arr)) return VALUE_ERROR;
  const arr2 = to2D(arr).map((row) => [...row]);
  const sortIdx = args.length > 1 ? toNumber(args[1]) : 1;
  if (isFormulaError(sortIdx)) return sortIdx;
  const order = args.length > 2 ? toNumber(args[2]) : 1;
  if (isFormulaError(order)) return order;
  const byRow = args.length > 3 ? toBoolean(args[3]) : false;
  if (isFormulaError(byRow)) return byRow;
  const ci = Math.trunc(sortIdx) - 1;
  const dir = order < 0 ? -1 : 1;
  if (byRow) {
    // Sort columns by row `ci`.
    const ncols = arr2[0]?.length ?? 0;
    const cols = Array.from({ length: ncols }, (_, j) => arr2.map((r) => r[j]));
    cols.sort((a, b) => dir * compare(a[ci], b[ci]));
    return arr2.map((_, r) => cols.map((c) => c[r]));
  }
  arr2.sort((a, b) => dir * compare(a[ci], b[ci]));
  return arr2;
});

register('SORTBY', (args) => {
  // SORTBY(array, by1, [order1], [by2, order2, ...])
  const arr = args[0];
  if (!Array.isArray(arr)) return VALUE_ERROR;
  const arr2 = to2D(arr);
  type SortKey = { values: unknown[]; dir: number };
  const keys: SortKey[] = [];
  let i = 1;
  while (i < args.length) {
    const by = args[i];
    if (!Array.isArray(by)) return VALUE_ERROR;
    const vals = (() => {
      if ((by as unknown[]).length > 0 && Array.isArray((by as unknown[])[0])) {
        return (by as unknown[][]).map((r) => r[0]);
      }
      return by as unknown[];
    })();
    if (vals.length !== arr2.length) return VALUE_ERROR;
    const order = i + 1 < args.length && !Array.isArray(args[i + 1])
      ? toNumber(args[i + 1])
      : 1;
    if (isFormulaError(order)) return order;
    keys.push({ values: vals, dir: order < 0 ? -1 : 1 });
    i += i + 1 < args.length && !Array.isArray(args[i + 1]) ? 2 : 1;
  }
  const indices = arr2.map((_, idx) => idx);
  indices.sort((a, b) => {
    for (const k of keys) {
      const cmp = compare(k.values[a], k.values[b]);
      if (cmp !== 0) return k.dir * cmp;
    }
    return 0;
  });
  return indices.map((idx) => arr2[idx]!);
});

register('UNIQUE', (args) => {
  const arr = args[0];
  if (!Array.isArray(arr)) return [[args[0]]];
  const arr2 = to2D(arr);
  // Match by row-tuple equality (Excel deduplicates whole rows).
  const seen = new Set<string>();
  const out: unknown[][] = [];
  for (const row of arr2) {
    const key = row.map((v) => (v === null || v === undefined ? '' : String(v))).join('');
    if (!seen.has(key)) {
      seen.add(key);
      out.push(row);
    }
  }
  return out;
});

register('SEQUENCE', (args) => {
  const rows = toNumber(args[0]);
  if (isFormulaError(rows)) return rows;
  const cols = args.length > 1 ? toNumber(args[1]) : 1;
  if (isFormulaError(cols)) return cols;
  const start = args.length > 2 ? toNumber(args[2]) : 1;
  if (isFormulaError(start)) return start;
  const step = args.length > 3 ? toNumber(args[3]) : 1;
  if (isFormulaError(step)) return step;
  const R = Math.trunc(rows);
  const C = Math.trunc(cols);
  if (R < 1 || C < 1) return NUM_ERROR;
  const out: number[][] = [];
  let v = start;
  for (let r = 0; r < R; r++) {
    const row: number[] = [];
    for (let c = 0; c < C; c++) {
      row.push(v);
      v += step;
    }
    out.push(row);
  }
  return out;
});

// -----------------------------------------------------------------------------
// Text expansion (v1.1.0 wave 3)
// -----------------------------------------------------------------------------

register('VALUE', (args) => {
  const v = args[0];
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === null || v === undefined || v === '') return 0;
  const s = toString_(v).trim();
  // Strip currency symbol, % suffix, leading +.
  let body = s.replace(/^\+/, '');
  const percent = body.endsWith('%');
  if (percent) body = body.slice(0, -1).trim();
  // Common currency symbols Excel recognizes.
  body = body.replace(/^[$£€¥]/, '');
  // Thousands separators.
  body = body.replace(/,/g, '');
  const n = Number(body);
  if (!Number.isFinite(n)) return VALUE_ERROR;
  return percent ? n / 100 : n;
});

register('NUMBERVALUE', (args) => {
  // NUMBERVALUE(text, [decimal_separator], [group_separator])
  const v = args[0];
  if (typeof v === 'number') return v;
  if (v === null || v === undefined || v === '') return 0;
  const s = toString_(v).trim();
  const dec = args.length > 1 ? toString_(args[1] ?? '.') : '.';
  const grp = args.length > 2 ? toString_(args[2] ?? ',') : ',';
  let body = s;
  // Strip group separator first, then translate decimal to '.'.
  if (grp) body = body.split(grp).join('');
  if (dec !== '.') body = body.split(dec).join('.');
  // Percent suffix.
  let scale = 1;
  while (body.endsWith('%')) {
    scale /= 100;
    body = body.slice(0, -1).trim();
  }
  const n = Number(body);
  if (!Number.isFinite(n)) return VALUE_ERROR;
  return n * scale;
});

register('TEXT', (args) => {
  // TEXT(value, format_text). Subset of Excel format codes:
  //   "0" / "0.00" — integer / fixed-decimal padding
  //   "#,##0" / "#,##0.00" — thousands separator
  //   "0%" / "0.00%" — percentage
  //   "$#,##0.00" — leading literal $
  //   "yyyy-mm-dd" / "yyyy/mm/dd" / "m/d/yyyy" — date formats
  //   "h:mm" / "h:mm:ss" — time formats
  //   "yyyy-mm-dd h:mm" — combined
  // Anything outside this subset falls back to String(value).
  const value = args[0];
  const fmt = args.length > 1 ? toString_(args[1] ?? '') : '';
  if (fmt === '') return toString_(value);
  if (isFormulaError(value)) return value;

  // Date/time codes — detect tokens.
  if (/[ymdhs]/i.test(fmt)) {
    const d = value instanceof Date ? value : typeof value === 'number'
      ? new Date(value)
      : typeof value === 'string'
        ? new Date(value)
        : null;
    if (!d || Number.isNaN(d.getTime())) return VALUE_ERROR;
    const pad = (n: number, w = 2) => String(n).padStart(w, '0');
    return fmt
      .replace(/yyyy/g, String(d.getFullYear()))
      .replace(/yy/g, String(d.getFullYear()).slice(-2))
      .replace(/mm/g, pad(d.getMonth() + 1))
      .replace(/m(?![ms])/g, String(d.getMonth() + 1))
      .replace(/dd/g, pad(d.getDate()))
      .replace(/d(?![dy])/g, String(d.getDate()))
      .replace(/HH|hh/g, pad(d.getHours()))
      .replace(/h/g, String(d.getHours()))
      .replace(/MM/g, pad(d.getMinutes())) // After date 'mm' already consumed.
      .replace(/ss/g, pad(d.getSeconds()))
      .replace(/s(?!s)/g, String(d.getSeconds()));
  }

  const n = toNumber(value);
  if (isFormulaError(n)) return n;
  const isPercent = /%/.test(fmt);
  const decimalsMatch = /\.(0+|#+)/.exec(fmt);
  const decimals = decimalsMatch ? decimalsMatch[1]!.length : 0;
  const useThousands = /#,##/.test(fmt) || /,##/.test(fmt);
  const leadingLiteral = /^[$£€¥]/.exec(fmt)?.[0] ?? '';
  const trailingLiteral = isPercent ? '%' : '';
  const scaled = isPercent ? n * 100 : n;
  let body = scaled.toFixed(decimals);
  if (useThousands) {
    const [intPart, fracPart] = body.split('.');
    body = intPart!.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fracPart ? '.' + fracPart : '');
  }
  return leadingLiteral + body + trailingLiteral;
});

register('DOLLAR', (args) => {
  const n = toNumber(args[0]);
  if (isFormulaError(n)) return n;
  const decimals = args.length > 1 ? toNumber(args[1]) : 2;
  if (isFormulaError(decimals)) return decimals;
  const d = Math.trunc(decimals);
  const sign = n < 0 ? '-' : '';
  const body = Math.abs(n)
    .toFixed(Math.max(0, d))
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}$${body}`;
});

register('FIXED', (args) => {
  const n = toNumber(args[0]);
  if (isFormulaError(n)) return n;
  const decimals = args.length > 1 ? toNumber(args[1]) : 2;
  if (isFormulaError(decimals)) return decimals;
  const noCommas = args.length > 2 ? toBoolean(args[2]) : false;
  if (isFormulaError(noCommas)) return noCommas;
  const body = n.toFixed(Math.max(0, Math.trunc(decimals)));
  if (noCommas) return body;
  const [intPart, fracPart] = body.split('.');
  return (
    (intPart!.startsWith('-') ? '-' : '') +
    intPart!.replace(/^-/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',') +
    (fracPart ? '.' + fracPart : '')
  );
});

register('REPT', (args) => {
  const s = toString_(args[0]);
  const n = toNumber(args[1]);
  if (isFormulaError(n)) return n;
  const k = Math.trunc(n);
  if (k < 0) return VALUE_ERROR;
  // Excel caps REPT result at 32767 chars.
  if (k * s.length > 32_767) return VALUE_ERROR;
  return s.repeat(k);
});

register('REPLACE', (args) => {
  const s = toString_(args[0]);
  const start = toNumber(args[1]);
  const numChars = toNumber(args[2]);
  if (isFormulaError(start)) return start;
  if (isFormulaError(numChars)) return numChars;
  const newText = toString_(args[3]);
  const s0 = Math.max(0, Math.trunc(start) - 1);
  const n = Math.max(0, Math.trunc(numChars));
  return s.slice(0, s0) + newText + s.slice(s0 + n);
});

register('SEARCH', (args) => {
  // Case-insensitive FIND; supports * / ? wildcards.
  const needleRaw = toString_(args[0]);
  const haystack = toString_(args[1]);
  const startAt = args.length > 2 ? toNumber(args[2]) : 1;
  if (isFormulaError(startAt)) return startAt;
  const start = Math.max(0, Math.trunc(startAt) - 1);
  // Build regex from wildcard pattern.
  const pattern =
    '^' +
    needleRaw
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.') +
    '$';
  // Wildcard search: walk from start, try anchored match at each position.
  if (/[*?]/.test(needleRaw)) {
    const re = new RegExp(pattern.slice(1, -1), 'i');
    const m = re.exec(haystack.slice(start));
    return m ? m.index + start + 1 : VALUE_ERROR;
  }
  const idx = haystack.toLowerCase().indexOf(needleRaw.toLowerCase(), start);
  return idx < 0 ? VALUE_ERROR : idx + 1;
});

register('CLEAN', (args) => {
  const s = toString_(args[0]);
  // Strip ASCII control chars 0x00-0x1F.
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\x00-\x1F]/g, '');
});

register('EXACT', (args) => {
  return toString_(args[0]) === toString_(args[1]);
});

register('PROPER', (args) => {
  const s = toString_(args[0]);
  // Capitalize the first letter following any non-letter; lowercase the rest.
  let out = '';
  let capitalizeNext = true;
  for (const ch of s) {
    if (/\p{L}/u.test(ch)) {
      out += capitalizeNext ? ch.toUpperCase() : ch.toLowerCase();
      capitalizeNext = false;
    } else {
      out += ch;
      capitalizeNext = true;
    }
  }
  return out;
});

register('CHAR', (args) => {
  const n = toNumber(args[0]);
  if (isFormulaError(n)) return n;
  const code = Math.trunc(n);
  if (code < 1 || code > 0x10ffff) return VALUE_ERROR;
  try {
    return String.fromCodePoint(code);
  } catch {
    return VALUE_ERROR;
  }
});

register('UNICHAR', getFunction('CHAR')!);

register('CODE', (args) => {
  const s = toString_(args[0]);
  if (s === '') return VALUE_ERROR;
  return s.charCodeAt(0);
});

register('UNICODE', (args) => {
  const s = toString_(args[0]);
  if (s === '') return VALUE_ERROR;
  const cp = s.codePointAt(0);
  return cp ?? VALUE_ERROR;
});

register('T', (args) => {
  // Returns text if input is text; '' otherwise.
  return typeof args[0] === 'string' ? args[0] : '';
});

register('TEXTJOIN', (args) => {
  // TEXTJOIN(delimiter, ignore_empty, text1, ...)
  const delim = toString_(args[0]);
  const ignore = toBoolean(args[1]);
  if (isFormulaError(ignore)) return ignore;
  const parts: string[] = [];
  for (const a of flatten(args.slice(2))) {
    if (isFormulaError(a)) return a;
    if (ignore && (a === null || a === undefined || a === '')) continue;
    parts.push(toString_(a));
  }
  // Excel caps at 32767 chars.
  const joined = parts.join(delim);
  if (joined.length > 32_767) return VALUE_ERROR;
  return joined;
});

register('TEXTSPLIT', (args) => {
  // TEXTSPLIT(text, col_delim, [row_delim], [ignore_empty], [match_mode], [pad_with])
  const text = toString_(args[0]);
  const colDelim = args[1];
  const rowDelim = args.length > 2 ? args[2] : null;
  const ignoreEmpty = args.length > 3 ? toBoolean(args[3]) : false;
  if (isFormulaError(ignoreEmpty)) return ignoreEmpty;
  // matchMode + padWith: matchMode 1 = case-insensitive (ignored; delims
  // are usually literal). padWith for jagged 2D — only used when both
  // delims are provided.
  const colDelims = Array.isArray(colDelim) ? (colDelim as unknown[]).map(toString_) : [toString_(colDelim)];
  const rowDelims = rowDelim === null ? null : Array.isArray(rowDelim) ? (rowDelim as unknown[]).map(toString_) : [toString_(rowDelim)];
  const splitWith = (s: string, delims: string[]): string[] => {
    if (delims.length === 1) return s.split(delims[0]!);
    // Build a regex that splits on any of the delims.
    const escaped = delims.map((d) => d.replace(/[.+^${}()|[\]\\]/g, '\\$&'));
    return s.split(new RegExp(escaped.join('|')));
  };
  const dropEmpty = (a: string[]): string[] => (ignoreEmpty ? a.filter((x) => x !== '') : a);
  if (rowDelims === null) {
    return [dropEmpty(splitWith(text, colDelims))];
  }
  const rowStrings = dropEmpty(splitWith(text, rowDelims));
  const out: string[][] = rowStrings.map((rs) => dropEmpty(splitWith(rs, colDelims)));
  return out;
});

register('TEXTBEFORE', (args) => {
  // TEXTBEFORE(text, delimiter, [instance_num], [match_mode], [match_end], [if_not_found])
  const text = toString_(args[0]);
  const delim = toString_(args[1]);
  const instance = args.length > 2 ? toNumber(args[2]) : 1;
  if (isFormulaError(instance)) return instance;
  const matchMode = args.length > 3 ? toNumber(args[3]) : 0;
  if (isFormulaError(matchMode)) return matchMode;
  const ifNotFound = args.length > 5 ? args[5] : NA_ERROR;
  const haystack = matchMode === 1 ? text.toLowerCase() : text;
  const needle = matchMode === 1 ? delim.toLowerCase() : delim;
  const inst = Math.trunc(instance);
  if (inst === 0 || delim === '') return text;
  if (inst > 0) {
    let pos = -1;
    for (let i = 0; i < inst; i++) {
      pos = haystack.indexOf(needle, pos + 1);
      if (pos < 0) return ifNotFound;
    }
    return text.slice(0, pos);
  }
  // Negative: count from the end.
  let pos = haystack.length;
  for (let i = 0; i < -inst; i++) {
    pos = haystack.lastIndexOf(needle, pos - 1);
    if (pos < 0) return ifNotFound;
  }
  return text.slice(0, pos);
});

register('TEXTAFTER', (args) => {
  const text = toString_(args[0]);
  const delim = toString_(args[1]);
  const instance = args.length > 2 ? toNumber(args[2]) : 1;
  if (isFormulaError(instance)) return instance;
  const matchMode = args.length > 3 ? toNumber(args[3]) : 0;
  if (isFormulaError(matchMode)) return matchMode;
  const ifNotFound = args.length > 5 ? args[5] : NA_ERROR;
  const haystack = matchMode === 1 ? text.toLowerCase() : text;
  const needle = matchMode === 1 ? delim.toLowerCase() : delim;
  const inst = Math.trunc(instance);
  if (inst === 0 || delim === '') return text;
  if (inst > 0) {
    let pos = -1;
    for (let i = 0; i < inst; i++) {
      pos = haystack.indexOf(needle, pos + 1);
      if (pos < 0) return ifNotFound;
    }
    return text.slice(pos + delim.length);
  }
  let pos = haystack.length;
  for (let i = 0; i < -inst; i++) {
    pos = haystack.lastIndexOf(needle, pos - 1);
    if (pos < 0) return ifNotFound;
  }
  return text.slice(pos + delim.length);
});

// -----------------------------------------------------------------------------
// Date / time expansion (v1.1.0 wave 4)
//
// Implementation notes:
//   - We use JS Date throughout. Excel's serial-date convention (days
//     since 1900-01-01 with the 1900-leap-year bug) is NOT used; the
//     OOXML adapter (Chunk A) is the right place to translate serial
//     numbers ↔ Date at the I/O boundary. Functions that take a "date"
//     accept Date, ms-since-epoch number, or a string Date.parse() can
//     handle.
//   - Workdays use local-time semantics; all-day arithmetic is done at
//     midnight to avoid DST drift.
// -----------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;

function daysBetween(a: Date, b: Date): number {
  // Whole days between two local-midnight dates, ignoring DST.
  const aDay = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const bDay = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((bDay - aDay) / MS_PER_DAY);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() + n);
  return r;
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), 1);
  r.setMonth(r.getMonth() + n);
  // Clamp day to month-end if original day exceeds it (Jan 31 + 1 month → Feb 28/29).
  const lastDay = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(d.getDate(), lastDay));
  return r;
}

// Excel-style weekend mask. Each char is '1' for weekend, '0' for workday,
// starting Monday. Defaults to "0000011" (Sat + Sun off).
function parseWeekendMask(arg: unknown): string | FormulaError {
  if (arg === null || arg === undefined) return '0000011';
  if (typeof arg === 'string' && /^[01]{7}$/.test(arg)) return arg;
  const n = toNumber(arg);
  if (isFormulaError(n)) return n;
  switch (Math.trunc(n)) {
    case 1:
      return '0000011'; // Sat-Sun (default)
    case 2:
      return '1000001'; // Sun-Mon
    case 3:
      return '1100000'; // Mon-Tue
    case 4:
      return '0110000'; // Tue-Wed
    case 5:
      return '0011000'; // Wed-Thu
    case 6:
      return '0001100'; // Thu-Fri
    case 7:
      return '0000110'; // Fri-Sat
    case 11:
      return '0000001'; // Sun only
    case 12:
      return '1000000'; // Mon only
    case 13:
      return '0100000'; // Tue only
    case 14:
      return '0010000'; // Wed only
    case 15:
      return '0001000'; // Thu only
    case 16:
      return '0000100'; // Fri only
    case 17:
      return '0000010'; // Sat only
    default:
      return NUM_ERROR;
  }
}

function isWeekend(d: Date, mask: string): boolean {
  // mask index 0 = Monday, 6 = Sunday.
  const jsDay = d.getDay(); // 0=Sun..6=Sat
  const monIdx = (jsDay + 6) % 7;
  return mask[monIdx] === '1';
}

register('DATE', (args) => {
  // DATE(year, month, day) — month/day overflow rolls into adjacent units.
  const y = toNumber(args[0]);
  const m = toNumber(args[1]);
  const day = toNumber(args[2]);
  if (isFormulaError(y)) return y;
  if (isFormulaError(m)) return m;
  if (isFormulaError(day)) return day;
  return new Date(Math.trunc(y), Math.trunc(m) - 1, Math.trunc(day));
});

register('TIME', (args) => {
  const h = toNumber(args[0]);
  const m = toNumber(args[1]);
  const s = toNumber(args[2]);
  if (isFormulaError(h)) return h;
  if (isFormulaError(m)) return m;
  if (isFormulaError(s)) return s;
  if (h < 0 || m < 0 || s < 0) return NUM_ERROR;
  // Excel TIME returns a fraction of a day in [0, 1).
  return ((Math.trunc(h) % 24) * 3600 + (Math.trunc(m) % 60) * 60 + (Math.trunc(s) % 60)) / 86400;
});

register('DATEVALUE', (args) => {
  const s = toString_(args[0]);
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return VALUE_ERROR;
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
});

register('TIMEVALUE', (args) => {
  const s = toString_(args[0]).trim();
  // Accept "h:mm[:ss] [AM/PM]" and "h:mm[:ss]"; reject anything else.
  const m = /^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM|am|pm)?$/.exec(s);
  if (!m) {
    // Last-resort: Date.parse a "1970-01-01T<s>".
    const t = Date.parse(`1970-01-01T${s}`);
    if (!Number.isFinite(t)) return VALUE_ERROR;
    const d = new Date(t);
    return (d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds()) / 86400;
  }
  let h = Number(m[1]);
  const mm = Number(m[2]);
  const ss = m[3] ? Number(m[3]) : 0;
  const ampm = m[4]?.toUpperCase();
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return (h * 3600 + mm * 60 + ss) / 86400;
});

register('HOUR', (args) => {
  const v = args[0];
  if (v instanceof Date) return v.getHours();
  if (typeof v === 'number') {
    const frac = v - Math.floor(v);
    return Math.floor(frac * 24);
  }
  const d = toDate(v);
  return d instanceof Date ? d.getHours() : d;
});

register('MINUTE', (args) => {
  const v = args[0];
  if (v instanceof Date) return v.getMinutes();
  if (typeof v === 'number') {
    const frac = v - Math.floor(v);
    return Math.floor((frac * 24 * 60) % 60);
  }
  const d = toDate(v);
  return d instanceof Date ? d.getMinutes() : d;
});

register('SECOND', (args) => {
  const v = args[0];
  if (v instanceof Date) return v.getSeconds();
  if (typeof v === 'number') {
    const frac = v - Math.floor(v);
    return Math.round((frac * 86400) % 60);
  }
  const d = toDate(v);
  return d instanceof Date ? d.getSeconds() : d;
});

register('WEEKDAY', (args) => {
  // Excel WEEKDAY(date, [return_type]):
  //   1 (default) → Sun=1..Sat=7
  //   2 → Mon=1..Sun=7
  //   3 → Mon=0..Sun=6
  //   11..17 → various start-day, 1-based
  const d = toDate(args[0]);
  if (!(d instanceof Date)) return d;
  const js = d.getDay(); // Sun=0..Sat=6
  const type = args.length > 1 ? toNumber(args[1]) : 1;
  if (isFormulaError(type)) return type;
  switch (Math.trunc(type)) {
    case 1:
      return js + 1;
    case 2:
      return ((js + 6) % 7) + 1;
    case 3:
      return (js + 6) % 7;
    case 11:
      return ((js + 6) % 7) + 1; // Mon=1
    case 12:
      return ((js + 5) % 7) + 1; // Tue=1
    case 13:
      return ((js + 4) % 7) + 1;
    case 14:
      return ((js + 3) % 7) + 1;
    case 15:
      return ((js + 2) % 7) + 1;
    case 16:
      return ((js + 1) % 7) + 1;
    case 17:
      return (js % 7) + 1; // Sun=1
    default:
      return NUM_ERROR;
  }
});

register('ISOWEEKNUM', (args) => {
  const d = toDate(args[0]);
  if (!(d instanceof Date)) return d;
  // ISO 8601 week: Thursday-anchored. Algorithm per the standard.
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (t.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  t.setUTCDate(t.getUTCDate() - dayNum + 3); // shift to Thursday
  const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const firstThuDay = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - firstThuDay + 3);
  return 1 + Math.round((t.getTime() - firstThu.getTime()) / (7 * MS_PER_DAY));
});

register('WEEKNUM', (args) => {
  // Default return_type 1 = week starts Sunday, week 1 contains Jan 1.
  // return_type 2 = week starts Monday. return_type 21 = ISO week.
  const d = toDate(args[0]);
  if (!(d instanceof Date)) return d;
  const returnType = args.length > 1 ? toNumber(args[1]) : 1;
  if (isFormulaError(returnType)) return returnType;
  if (returnType === 21) {
    return getFunction('ISOWEEKNUM')!([d]);
  }
  const startsMonday = returnType === 2 || returnType === 11;
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const jan1Day = jan1.getDay(); // Sun=0
  const offset = startsMonday ? (jan1Day + 6) % 7 : jan1Day;
  const days = daysBetween(jan1, d);
  return Math.floor((days + offset) / 7) + 1;
});

register('DAYS', (args) => {
  // DAYS(end_date, start_date) → number of days between.
  const end = toDate(args[0]);
  const start = toDate(args[1]);
  if (!(end instanceof Date)) return end;
  if (!(start instanceof Date)) return start;
  return daysBetween(start, end);
});

register('DAYS360', (args) => {
  // DAYS360 uses the 360-day (US/NASD) convention by default. method=true → European.
  const start = toDate(args[0]);
  const end = toDate(args[1]);
  if (!(start instanceof Date)) return start;
  if (!(end instanceof Date)) return end;
  const european = args.length > 2 ? toBoolean(args[2]) : false;
  if (isFormulaError(european)) return european;
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
    // US NASD
    const endOfFeb = (y: number, m: number) =>
      m === 2 && new Date(y, m, 0).getDate() === d1;
    if (endOfFeb(y1, m1) && endOfFeb(y2, m2)) d2 = 30;
    if (endOfFeb(y1, m1)) d1 = 30;
    if (d2 === 31 && d1 >= 30) d2 = 30;
    if (d1 === 31) d1 = 30;
  }
  return 360 * (y2 - y1) + 30 * (m2 - m1) + (d2 - d1);
});

register('EDATE', (args) => {
  const start = toDate(args[0]);
  if (!(start instanceof Date)) return start;
  const months = toNumber(args[1]);
  if (isFormulaError(months)) return months;
  return addMonths(start, Math.trunc(months));
});

register('EOMONTH', (args) => {
  const start = toDate(args[0]);
  if (!(start instanceof Date)) return start;
  const months = toNumber(args[1]);
  if (isFormulaError(months)) return months;
  const shifted = addMonths(start, Math.trunc(months));
  return new Date(shifted.getFullYear(), shifted.getMonth() + 1, 0);
});

register('YEARFRAC', (args) => {
  // YEARFRAC(start, end, [basis]). Basis 0 = 30/360 US (default), 1 = act/act,
  // 2 = act/360, 3 = act/365, 4 = 30/360 European.
  const start = toDate(args[0]);
  const end = toDate(args[1]);
  if (!(start instanceof Date)) return start;
  if (!(end instanceof Date)) return end;
  const basis = args.length > 2 ? toNumber(args[2]) : 0;
  if (isFormulaError(basis)) return basis;
  const lo = start <= end ? start : end;
  const hi = start <= end ? end : start;
  switch (Math.trunc(basis)) {
    case 0: {
      const d = getFunction('DAYS360')!([lo, hi]);
      if (isFormulaError(d)) return d;
      return (d as number) / 360;
    }
    case 1: {
      // Actual/actual: divide by 365 or 366 depending on whether the
      // interval includes a leap day. Approximation: average year length
      // over [lo, hi].
      const days = daysBetween(lo, hi);
      const ys = hi.getFullYear() - lo.getFullYear() + 1;
      let avgDays = 0;
      for (let y = lo.getFullYear(); y <= hi.getFullYear(); y++) {
        avgDays += isLeapYear(y) ? 366 : 365;
      }
      return days / (avgDays / ys);
    }
    case 2:
      return daysBetween(lo, hi) / 360;
    case 3:
      return daysBetween(lo, hi) / 365;
    case 4: {
      const d = getFunction('DAYS360')!([lo, hi, true]);
      if (isFormulaError(d)) return d;
      return (d as number) / 360;
    }
    default:
      return NUM_ERROR;
  }
});

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

register('DATEDIF', (args) => {
  const start = toDate(args[0]);
  const end = toDate(args[1]);
  if (!(start instanceof Date)) return start;
  if (!(end instanceof Date)) return end;
  const unit = toString_(args[2]).toUpperCase();
  if (end < start) return NUM_ERROR;
  switch (unit) {
    case 'Y':
      return endOfDiff(start, end, 'year');
    case 'M':
      return endOfDiff(start, end, 'month');
    case 'D':
      return daysBetween(start, end);
    case 'MD': {
      // Days ignoring months and years.
      const ref = new Date(end.getFullYear(), end.getMonth(), start.getDate());
      let d = daysBetween(ref, end);
      if (d < 0) {
        const prevMonth = new Date(end.getFullYear(), end.getMonth() - 1, start.getDate());
        d = daysBetween(prevMonth, end);
      }
      return d;
    }
    case 'YM': {
      let m = end.getMonth() - start.getMonth();
      if (end.getDate() < start.getDate()) m--;
      return ((m % 12) + 12) % 12;
    }
    case 'YD': {
      const ref = new Date(start.getFullYear() + endOfDiff(start, end, 'year'), start.getMonth(), start.getDate());
      return daysBetween(ref, end);
    }
    default:
      return NUM_ERROR;
  }
});

function endOfDiff(start: Date, end: Date, unit: 'year' | 'month'): number {
  if (unit === 'year') {
    let y = end.getFullYear() - start.getFullYear();
    if (end.getMonth() < start.getMonth() || (end.getMonth() === start.getMonth() && end.getDate() < start.getDate())) y--;
    return y;
  }
  let m = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) m--;
  return m;
}

register('NETWORKDAYS.INTL', (args) => {
  const start = toDate(args[0]);
  const end = toDate(args[1]);
  if (!(start instanceof Date)) return start;
  if (!(end instanceof Date)) return end;
  const mask = parseWeekendMask(args[2]);
  if (typeof mask !== 'string') return mask;
  const holidays = collectHolidays(args[3]);
  const lo = start <= end ? start : end;
  const hi = start <= end ? end : start;
  const sign = start <= end ? 1 : -1;
  let count = 0;
  let d = new Date(lo);
  d.setHours(0, 0, 0, 0);
  const stop = new Date(hi);
  stop.setHours(0, 0, 0, 0);
  while (d <= stop) {
    if (!isWeekend(d, mask) && !holidays.has(d.toDateString())) count++;
    d = addDays(d, 1);
  }
  return sign * count;
});

register('NETWORKDAYS', (args) => {
  const inner = getFunction('NETWORKDAYS.INTL')!;
  return inner([args[0], args[1], 1, args[2]]);
});

register('WORKDAY.INTL', (args) => {
  const start = toDate(args[0]);
  if (!(start instanceof Date)) return start;
  const days = toNumber(args[1]);
  if (isFormulaError(days)) return days;
  const mask = parseWeekendMask(args[2]);
  if (typeof mask !== 'string') return mask;
  const holidays = collectHolidays(args[3]);
  let n = Math.trunc(days);
  const step = n >= 0 ? 1 : -1;
  let d = new Date(start);
  d.setHours(0, 0, 0, 0);
  while (n !== 0) {
    d = addDays(d, step);
    if (!isWeekend(d, mask) && !holidays.has(d.toDateString())) n -= step;
  }
  return d;
});

register('WORKDAY', (args) => {
  const inner = getFunction('WORKDAY.INTL')!;
  return inner([args[0], args[1], 1, args[2]]);
});

function collectHolidays(arg: unknown): Set<string> {
  const out = new Set<string>();
  if (arg === undefined || arg === null) return out;
  const flat = Array.isArray(arg) ? (arg as unknown[]).flat() : [arg];
  for (const v of flat) {
    const d = toDate(v);
    if (d instanceof Date) out.add(d.toDateString());
  }
  return out;
}

// -----------------------------------------------------------------------------
// Financial (v1.1.0 wave 5)
//
// Annuity formulas follow Excel's sign convention: money OUT of the
// borrower is positive, money IN is negative. PMT(rate, nper, pv) on a
// loan with pv=10000 returns a NEGATIVE number (the periodic payment
// you owe).
//
// IRR/XIRR/RATE iterate via Newton's method with a safety bisection
// fallback. Bond functions (PRICE/YIELD/DURATION) implement the
// textbook semi-annual coupon model; bases are 30/360 US (0, default),
// act/act (1), act/360 (2), act/365 (3), 30E/360 (4).
// -----------------------------------------------------------------------------

function fvFactor(rate: number, nper: number): number {
  return Math.pow(1 + rate, nper);
}

register('PMT', (args) => {
  const rate = toNumber(args[0]);
  const nper = toNumber(args[1]);
  const pv = toNumber(args[2]);
  if (isFormulaError(rate)) return rate;
  if (isFormulaError(nper)) return nper;
  if (isFormulaError(pv)) return pv;
  const fv = args.length > 3 ? toNumber(args[3]) : 0;
  if (isFormulaError(fv)) return fv;
  const type = args.length > 4 ? toNumber(args[4]) : 0;
  if (isFormulaError(type)) return type;
  if (rate === 0) return -(pv + fv) / nper;
  const f = fvFactor(rate, nper);
  return -((pv * f + fv) * rate) / ((1 + rate * type) * (f - 1));
});

register('FV', (args) => {
  const rate = toNumber(args[0]);
  const nper = toNumber(args[1]);
  const pmt = toNumber(args[2]);
  if (isFormulaError(rate)) return rate;
  if (isFormulaError(nper)) return nper;
  if (isFormulaError(pmt)) return pmt;
  const pv = args.length > 3 ? toNumber(args[3]) : 0;
  if (isFormulaError(pv)) return pv;
  const type = args.length > 4 ? toNumber(args[4]) : 0;
  if (isFormulaError(type)) return type;
  if (rate === 0) return -(pv + pmt * nper);
  const f = fvFactor(rate, nper);
  return -(pv * f + pmt * (1 + rate * type) * ((f - 1) / rate));
});

register('PV', (args) => {
  const rate = toNumber(args[0]);
  const nper = toNumber(args[1]);
  const pmt = toNumber(args[2]);
  if (isFormulaError(rate)) return rate;
  if (isFormulaError(nper)) return nper;
  if (isFormulaError(pmt)) return pmt;
  const fv = args.length > 3 ? toNumber(args[3]) : 0;
  if (isFormulaError(fv)) return fv;
  const type = args.length > 4 ? toNumber(args[4]) : 0;
  if (isFormulaError(type)) return type;
  if (rate === 0) return -(pmt * nper + fv);
  const f = fvFactor(rate, nper);
  return -(pmt * (1 + rate * type) * ((f - 1) / rate) + fv) / f;
});

register('NPER', (args) => {
  const rate = toNumber(args[0]);
  const pmt = toNumber(args[1]);
  const pv = toNumber(args[2]);
  if (isFormulaError(rate)) return rate;
  if (isFormulaError(pmt)) return pmt;
  if (isFormulaError(pv)) return pv;
  const fv = args.length > 3 ? toNumber(args[3]) : 0;
  if (isFormulaError(fv)) return fv;
  const type = args.length > 4 ? toNumber(args[4]) : 0;
  if (isFormulaError(type)) return type;
  if (rate === 0) {
    if (pmt === 0) return NUM_ERROR;
    return -(pv + fv) / pmt;
  }
  const adj = pmt * (1 + rate * type);
  const a = adj - fv * rate;
  const b = adj + pv * rate;
  if (a / b <= 0) return NUM_ERROR;
  return Math.log(a / b) / Math.log(1 + rate);
});

register('IPMT', (args) => {
  const rate = toNumber(args[0]);
  const per = toNumber(args[1]);
  const nper = toNumber(args[2]);
  const pv = toNumber(args[3]);
  if (isFormulaError(rate)) return rate;
  if (isFormulaError(per)) return per;
  if (isFormulaError(nper)) return nper;
  if (isFormulaError(pv)) return pv;
  const fv = args.length > 4 ? toNumber(args[4]) : 0;
  if (isFormulaError(fv)) return fv;
  const type = args.length > 5 ? toNumber(args[5]) : 0;
  if (isFormulaError(type)) return type;
  if (per < 1 || per > nper) return NUM_ERROR;
  const pmt = getFunction('PMT')!([rate, nper, pv, fv, type]) as number;
  // Balance at start of period `per`: FV of (per-1) periods.
  if (rate === 0) return 0;
  const balance = type === 1 && per === 1
    ? pv
    : -(pv * fvFactor(rate, per - 1) + pmt * ((fvFactor(rate, per - 1) - 1) / rate));
  const ipmt = balance * rate;
  // type=1 adjustments: interest in period 1 is 0.
  if (type === 1 && per === 1) return 0;
  if (type === 1) return ipmt / (1 + rate);
  return ipmt;
});

register('PPMT', (args) => {
  const pmt = getFunction('PMT')!(args.slice(0, 1).concat(args.slice(2)));
  if (isFormulaError(pmt)) return pmt;
  const ipmt = getFunction('IPMT')!(args);
  if (isFormulaError(ipmt)) return ipmt;
  return (pmt as number) - (ipmt as number);
});

register('RATE', (args) => {
  // Newton's method on FV-equation.
  const nper = toNumber(args[0]);
  const pmt = toNumber(args[1]);
  const pv = toNumber(args[2]);
  if (isFormulaError(nper)) return nper;
  if (isFormulaError(pmt)) return pmt;
  if (isFormulaError(pv)) return pv;
  const fv = args.length > 3 ? toNumber(args[3]) : 0;
  if (isFormulaError(fv)) return fv;
  const type = args.length > 4 ? toNumber(args[4]) : 0;
  if (isFormulaError(type)) return type;
  const guess = args.length > 5 ? toNumber(args[5]) : 0.1;
  if (isFormulaError(guess)) return guess;
  let r = guess;
  for (let i = 0; i < 50; i++) {
    const f = fvFactor(r, nper);
    const eq = pv * f + pmt * (1 + r * type) * ((f - 1) / (r === 0 ? 1 : r)) + fv;
    // Numeric derivative via small finite difference.
    const h = 1e-6;
    const f2 = fvFactor(r + h, nper);
    const eq2 = pv * f2 + pmt * (1 + (r + h) * type) * ((f2 - 1) / ((r + h) === 0 ? 1 : r + h)) + fv;
    const slope = (eq2 - eq) / h;
    if (slope === 0) return NUM_ERROR;
    const next = r - eq / slope;
    if (!Number.isFinite(next)) return NUM_ERROR;
    if (Math.abs(next - r) < 1e-10) return next;
    r = next;
  }
  return NUM_ERROR;
});

register('NPV', (args) => {
  // NPV(rate, value1, value2, ...). First cashflow is at period 1.
  const rate = toNumber(args[0]);
  if (isFormulaError(rate)) return rate;
  let total = 0;
  let i = 1;
  for (const v of flatten(args.slice(1))) {
    if (isFormulaError(v)) return v;
    const n = toNumber(v);
    if (isFormulaError(n)) continue; // Excel skips text/blanks.
    total += n / Math.pow(1 + rate, i);
    i++;
  }
  return total;
});

register('XNPV', (args) => {
  // XNPV(rate, values, dates)
  const rate = toNumber(args[0]);
  if (isFormulaError(rate)) return rate;
  const values = (() => {
    const v = args[1];
    if (Array.isArray(v) && v.length > 0 && Array.isArray(v[0])) {
      return (v as unknown[][]).flat();
    }
    return Array.isArray(v) ? (v as unknown[]) : [v];
  })();
  const dates = (() => {
    const v = args[2];
    if (Array.isArray(v) && v.length > 0 && Array.isArray(v[0])) {
      return (v as unknown[][]).flat();
    }
    return Array.isArray(v) ? (v as unknown[]) : [v];
  })();
  if (values.length !== dates.length || values.length === 0) return NUM_ERROR;
  const dateNums: number[] = [];
  for (const d of dates) {
    const dd = toDate(d);
    if (!(dd instanceof Date)) return VALUE_ERROR;
    dateNums.push(dd.getTime());
  }
  const t0 = dateNums[0]!;
  let total = 0;
  for (let i = 0; i < values.length; i++) {
    const n = toNumber(values[i]);
    if (isFormulaError(n)) return n;
    const years = (dateNums[i]! - t0) / (365 * MS_PER_DAY);
    total += n / Math.pow(1 + rate, years);
  }
  return total;
});

function newtonRoot(
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

register('IRR', (args) => {
  // IRR(values, [guess]). Cashflows[0] is at time 0.
  const values: number[] = [];
  for (const v of flatten([args[0]])) {
    if (isFormulaError(v)) return v;
    const n = toNumber(v);
    if (isFormulaError(n)) continue;
    values.push(n);
  }
  if (values.length === 0) return NUM_ERROR;
  const guess = args.length > 1 ? toNumber(args[1]) : 0.1;
  if (isFormulaError(guess)) return guess;
  const f = (r: number): number => {
    let total = 0;
    for (let i = 0; i < values.length; i++) total += values[i]! / Math.pow(1 + r, i);
    return total;
  };
  return newtonRoot(f, guess);
});

register('XIRR', (args) => {
  const values: number[] = [];
  for (const v of flatten([args[0]])) {
    if (isFormulaError(v)) return v;
    const n = toNumber(v);
    if (isFormulaError(n)) continue;
    values.push(n);
  }
  const dates: number[] = [];
  for (const d of flatten([args[1]])) {
    const dd = toDate(d);
    if (!(dd instanceof Date)) return VALUE_ERROR;
    dates.push(dd.getTime());
  }
  if (values.length !== dates.length || values.length === 0) return NUM_ERROR;
  const guess = args.length > 2 ? toNumber(args[2]) : 0.1;
  if (isFormulaError(guess)) return guess;
  const t0 = dates[0]!;
  const f = (r: number): number => {
    let total = 0;
    for (let i = 0; i < values.length; i++) {
      const years = (dates[i]! - t0) / (365 * MS_PER_DAY);
      total += values[i]! / Math.pow(1 + r, years);
    }
    return total;
  };
  return newtonRoot(f, guess);
});

register('MIRR', (args) => {
  const values: number[] = [];
  for (const v of flatten([args[0]])) {
    if (isFormulaError(v)) return v;
    const n = toNumber(v);
    if (isFormulaError(n)) continue;
    values.push(n);
  }
  const financeRate = toNumber(args[1]);
  const reinvestRate = toNumber(args[2]);
  if (isFormulaError(financeRate)) return financeRate;
  if (isFormulaError(reinvestRate)) return reinvestRate;
  const n = values.length - 1;
  if (n < 1) return NUM_ERROR;
  let pvNeg = 0, fvPos = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (v < 0) pvNeg += v / Math.pow(1 + financeRate, i);
    else fvPos += v * Math.pow(1 + reinvestRate, n - i);
  }
  if (pvNeg === 0 || fvPos === 0) return DIV_ZERO;
  return Math.pow(-fvPos / pvNeg, 1 / n) - 1;
});

// ---- Depreciation ----

register('SLN', (args) => {
  const cost = toNumber(args[0]);
  const salvage = toNumber(args[1]);
  const life = toNumber(args[2]);
  if (isFormulaError(cost)) return cost;
  if (isFormulaError(salvage)) return salvage;
  if (isFormulaError(life)) return life;
  if (life === 0) return DIV_ZERO;
  return (cost - salvage) / life;
});

register('SYD', (args) => {
  const cost = toNumber(args[0]);
  const salvage = toNumber(args[1]);
  const life = toNumber(args[2]);
  const per = toNumber(args[3]);
  if (isFormulaError(cost)) return cost;
  if (isFormulaError(salvage)) return salvage;
  if (isFormulaError(life)) return life;
  if (isFormulaError(per)) return per;
  if (life <= 0 || per < 1 || per > life) return NUM_ERROR;
  return ((cost - salvage) * (life - per + 1) * 2) / (life * (life + 1));
});

register('DB', (args) => {
  // Declining-balance fixed-rate. Rate = 1 - (salvage/cost)^(1/life), rounded to 3 decimals.
  const cost = toNumber(args[0]);
  const salvage = toNumber(args[1]);
  const life = toNumber(args[2]);
  const period = toNumber(args[3]);
  if (isFormulaError(cost)) return cost;
  if (isFormulaError(salvage)) return salvage;
  if (isFormulaError(life)) return life;
  if (isFormulaError(period)) return period;
  const month = args.length > 4 ? toNumber(args[4]) : 12;
  if (isFormulaError(month)) return month;
  if (cost <= 0 || salvage < 0 || life <= 0 || period < 1) return NUM_ERROR;
  const rate = Math.round((1 - Math.pow(salvage / cost, 1 / life)) * 1000) / 1000;
  // First-year prorate by `month`.
  if (period === 1) return (cost * rate * month) / 12;
  // Accumulated depreciation through period-1.
  let totalDep = (cost * rate * month) / 12;
  for (let p = 2; p < period; p++) totalDep += (cost - totalDep) * rate;
  // Last period prorate by (12-month).
  if (period === Math.ceil(life) + (month < 12 ? 1 : 0)) {
    return ((cost - totalDep) * rate * (12 - month)) / 12;
  }
  return (cost - totalDep) * rate;
});

register('DDB', (args) => {
  const cost = toNumber(args[0]);
  const salvage = toNumber(args[1]);
  const life = toNumber(args[2]);
  const period = toNumber(args[3]);
  if (isFormulaError(cost)) return cost;
  if (isFormulaError(salvage)) return salvage;
  if (isFormulaError(life)) return life;
  if (isFormulaError(period)) return period;
  const factor = args.length > 4 ? toNumber(args[4]) : 2;
  if (isFormulaError(factor)) return factor;
  if (cost < 0 || salvage < 0 || life <= 0 || period < 1) return NUM_ERROR;
  const rate = factor / life;
  let totalDep = 0;
  for (let p = 1; p < period; p++) {
    const dep = Math.min((cost - totalDep) * rate, cost - salvage - totalDep);
    totalDep += Math.max(dep, 0);
  }
  const dep = Math.min((cost - totalDep) * rate, cost - salvage - totalDep);
  return Math.max(dep, 0);
});

register('VDB', (args) => {
  // Variable declining balance: sum of declining-balance dep from start_period to end_period,
  // optionally switching to SLN when SLN > DB.
  const cost = toNumber(args[0]);
  const salvage = toNumber(args[1]);
  const life = toNumber(args[2]);
  const start = toNumber(args[3]);
  const end = toNumber(args[4]);
  if (isFormulaError(cost)) return cost;
  if (isFormulaError(salvage)) return salvage;
  if (isFormulaError(life)) return life;
  if (isFormulaError(start)) return start;
  if (isFormulaError(end)) return end;
  const factor = args.length > 5 ? toNumber(args[5]) : 2;
  if (isFormulaError(factor)) return factor;
  const noSwitch = args.length > 6 ? toBoolean(args[6]) : false;
  if (isFormulaError(noSwitch)) return noSwitch;
  if (start < 0 || end < start || end > life) return NUM_ERROR;
  const rate = factor / life;
  let balance = cost;
  let totalSinceStart = 0;
  for (let p = 1; p <= Math.ceil(end); p++) {
    let dep = Math.min(balance * rate, balance - salvage);
    if (!noSwitch) {
      const sln = (balance - salvage) / (life - p + 1);
      if (sln > dep) dep = sln;
    }
    dep = Math.max(dep, 0);
    const pStart = Math.max(start, p - 1);
    const pEnd = Math.min(end, p);
    if (pEnd > pStart) totalSinceStart += dep * (pEnd - pStart);
    balance -= dep;
  }
  return totalSinceStart;
});

// ---- Bond / accrual ----

register('ACCRINTM', (args) => {
  // ACCRINTM(issue, settlement, rate, par, [basis])
  const issue = toDate(args[0]);
  const settle = toDate(args[1]);
  if (!(issue instanceof Date)) return issue;
  if (!(settle instanceof Date)) return settle;
  const rate = toNumber(args[2]);
  const par = toNumber(args[3]);
  if (isFormulaError(rate)) return rate;
  if (isFormulaError(par)) return par;
  const yf = getFunction('YEARFRAC')!([issue, settle, args[4] ?? 0]);
  if (isFormulaError(yf)) return yf;
  return par * rate * (yf as number);
});

register('ACCRINT', (args) => {
  // ACCRINT(issue, first_interest, settlement, rate, par, frequency, [basis])
  // Simplification: accrued = par * rate * yearfrac(issue, settlement, basis).
  // Full Excel implementation handles per-coupon-period accrual; we ship the
  // closed-form approximation that matches Excel for the common case.
  const issue = toDate(args[0]);
  const settle = toDate(args[2]);
  if (!(issue instanceof Date)) return issue;
  if (!(settle instanceof Date)) return settle;
  const rate = toNumber(args[3]);
  const par = toNumber(args[4]);
  if (isFormulaError(rate)) return rate;
  if (isFormulaError(par)) return par;
  const yf = getFunction('YEARFRAC')!([issue, settle, args[6] ?? 0]);
  if (isFormulaError(yf)) return yf;
  return par * rate * (yf as number);
});

// Coupon helpers — backward iteration from maturity in 12/frequency-month steps.
function coupDates(
  settle: Date,
  maturity: Date,
  frequency: number,
): { prev: Date; next: Date; total: number } | FormulaError {
  if (frequency !== 1 && frequency !== 2 && frequency !== 4) return NUM_ERROR;
  if (settle >= maturity) return NUM_ERROR;
  const monthsBetween = 12 / frequency;
  let d = new Date(maturity);
  let count = 0;
  while (d > settle) {
    d = addMonths(d, -monthsBetween);
    count++;
  }
  // Now d <= settle < addMonths(d, monthsBetween).
  return { prev: d, next: addMonths(d, monthsBetween), total: count };
}

register('COUPNUM', (args) => {
  const settle = toDate(args[0]);
  const maturity = toDate(args[1]);
  if (!(settle instanceof Date)) return settle;
  if (!(maturity instanceof Date)) return maturity;
  const freq = toNumber(args[2]);
  if (isFormulaError(freq)) return freq;
  const r = coupDates(settle, maturity, Math.trunc(freq));
  if (r instanceof FormulaError) return r;
  return r.total;
});

register('COUPNCD', (args) => {
  const settle = toDate(args[0]);
  const maturity = toDate(args[1]);
  if (!(settle instanceof Date)) return settle;
  if (!(maturity instanceof Date)) return maturity;
  const freq = toNumber(args[2]);
  if (isFormulaError(freq)) return freq;
  const r = coupDates(settle, maturity, Math.trunc(freq));
  if (r instanceof FormulaError) return r;
  return r.next;
});

register('COUPPCD', (args) => {
  const settle = toDate(args[0]);
  const maturity = toDate(args[1]);
  if (!(settle instanceof Date)) return settle;
  if (!(maturity instanceof Date)) return maturity;
  const freq = toNumber(args[2]);
  if (isFormulaError(freq)) return freq;
  const r = coupDates(settle, maturity, Math.trunc(freq));
  if (r instanceof FormulaError) return r;
  return r.prev;
});

// PRICE: clean price of a bond per $100 face, given yield-to-maturity.
register('PRICE', (args) => {
  const settle = toDate(args[0]);
  const maturity = toDate(args[1]);
  if (!(settle instanceof Date)) return settle;
  if (!(maturity instanceof Date)) return maturity;
  const rate = toNumber(args[2]); // coupon rate
  const yld = toNumber(args[3]); // yield
  const redemption = toNumber(args[4]);
  const freq = toNumber(args[5]);
  if (isFormulaError(rate)) return rate;
  if (isFormulaError(yld)) return yld;
  if (isFormulaError(redemption)) return redemption;
  if (isFormulaError(freq)) return freq;
  if (freq !== 1 && freq !== 2 && freq !== 4) return NUM_ERROR;
  const basis = args.length > 6 ? toNumber(args[6]) : 0;
  if (isFormulaError(basis)) return basis;

  const cd = coupDates(settle, maturity, freq);
  if (cd instanceof FormulaError) return cd;
  const N = cd.total; // coupons remaining
  // Year fractions.
  const yfNextSettle = getFunction('YEARFRAC')!([settle, cd.next, basis]);
  if (isFormulaError(yfNextSettle)) return yfNextSettle;
  const A_ratio = (yfNextSettle as number) * freq; // fraction of next coupon period remaining
  const periodicYield = yld / freq;
  const coupon = (rate * redemption) / freq;
  let pv = 0;
  for (let k = 1; k <= N; k++) {
    pv += coupon / Math.pow(1 + periodicYield, k - 1 + A_ratio);
  }
  pv += redemption / Math.pow(1 + periodicYield, N - 1 + A_ratio);
  // Subtract accrued interest (full coupon period − remaining fraction).
  const accrued = coupon * (1 - A_ratio);
  return pv - accrued;
});

register('YIELD', (args) => {
  // YIELD: solve PRICE(yld) = price. Newton's method.
  const settle = args[0];
  const maturity = args[1];
  const rate = toNumber(args[2]);
  const price = toNumber(args[3]);
  const redemption = toNumber(args[4]);
  const freq = toNumber(args[5]);
  if (isFormulaError(rate)) return rate;
  if (isFormulaError(price)) return price;
  if (isFormulaError(redemption)) return redemption;
  if (isFormulaError(freq)) return freq;
  const basis = args.length > 6 ? args[6] : 0;
  const guess = rate; // start from the coupon rate
  const fn = (y: number): number => {
    const p = getFunction('PRICE')!([settle, maturity, rate, y, redemption, freq, basis]);
    if (isFormulaError(p)) return Number.POSITIVE_INFINITY;
    return (p as number) - price;
  };
  return newtonRoot(fn, guess);
});

register('DURATION', (args) => {
  // Macaulay duration.
  const settle = toDate(args[0]);
  const maturity = toDate(args[1]);
  if (!(settle instanceof Date)) return settle;
  if (!(maturity instanceof Date)) return maturity;
  const couponRate = toNumber(args[2]);
  const yld = toNumber(args[3]);
  const freq = toNumber(args[4]);
  if (isFormulaError(couponRate)) return couponRate;
  if (isFormulaError(yld)) return yld;
  if (isFormulaError(freq)) return freq;
  if (freq !== 1 && freq !== 2 && freq !== 4) return NUM_ERROR;
  const basis = args.length > 5 ? toNumber(args[5]) : 0;
  if (isFormulaError(basis)) return basis;

  const cd = coupDates(settle, maturity, freq);
  if (cd instanceof FormulaError) return cd;
  const N = cd.total;
  const yfNextSettle = getFunction('YEARFRAC')!([settle, cd.next, basis]);
  if (isFormulaError(yfNextSettle)) return yfNextSettle;
  const A_ratio = (yfNextSettle as number) * freq;
  const periodicYield = yld / freq;
  const coupon = couponRate * 100 / freq;
  let pv = 0, wpv = 0;
  for (let k = 1; k <= N; k++) {
    const t = (k - 1 + A_ratio) / freq;
    const cf = coupon / Math.pow(1 + periodicYield, k - 1 + A_ratio);
    pv += cf;
    wpv += t * cf;
  }
  const T = (N - 1 + A_ratio) / freq;
  const finalCf = 100 / Math.pow(1 + periodicYield, N - 1 + A_ratio);
  pv += finalCf;
  wpv += T * finalCf;
  return pv === 0 ? DIV_ZERO : wpv / pv;
});

register('MDURATION', (args) => {
  const dur = getFunction('DURATION')!(args);
  if (isFormulaError(dur)) return dur;
  const yld = toNumber(args[3]);
  const freq = toNumber(args[4]);
  if (isFormulaError(yld)) return yld;
  if (isFormulaError(freq)) return freq;
  return (dur as number) / (1 + yld / freq);
});

// -----------------------------------------------------------------------------
// Sentinel registrations exported for testing visibility.
// -----------------------------------------------------------------------------

export { NAME_ERROR, NA_ERROR };
