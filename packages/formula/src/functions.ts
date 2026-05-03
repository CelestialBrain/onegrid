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
// Sentinel registrations exported for testing visibility.
// -----------------------------------------------------------------------------

export { NAME_ERROR, NA_ERROR };
