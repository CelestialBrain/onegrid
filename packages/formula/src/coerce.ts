// =============================================================================
// Excel-style value coercion.
//
// Functions like SUM treat strings parseable as numbers AS numbers; functions
// like CONCAT treat numbers as their string form; comparisons coerce.
// Booleans coerce to 1/0 numerically.
// =============================================================================

import { FormulaError, VALUE_ERROR } from './errors';

export function toNumber(v: unknown): number | FormulaError {
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
    return VALUE_ERROR;
  }
  if (v instanceof FormulaError) return v;
  if (v instanceof Date) return v.getTime();
  return VALUE_ERROR;
}

export function toString_(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v instanceof FormulaError) return v.toString();
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

export function toBoolean(v: unknown): boolean | FormulaError {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const u = v.toUpperCase();
    if (u === 'TRUE') return true;
    if (u === 'FALSE') return false;
    return VALUE_ERROR;
  }
  if (v === null || v === undefined) return false;
  if (v instanceof FormulaError) return v;
  return VALUE_ERROR;
}

export function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  if (typeof a === 'string' && typeof b === 'string') {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  // Mixed: coerce both to numbers if possible, else strings.
  const an = toNumber(a);
  const bn = toNumber(b);
  if (typeof an === 'number' && typeof bn === 'number') {
    return an < bn ? -1 : an > bn ? 1 : 0;
  }
  const sa = toString_(a);
  const sb = toString_(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}
