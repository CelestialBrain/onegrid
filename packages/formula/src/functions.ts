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
// Sentinel registrations exported for testing visibility.
// -----------------------------------------------------------------------------

export { NAME_ERROR, NA_ERROR };
