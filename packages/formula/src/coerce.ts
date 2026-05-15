// =============================================================================
// Excel-style value coercion.
//
// Functions like SUM treat strings parseable as numbers AS numbers; functions
// like CONCAT treat numbers as their string form; comparisons coerce.
// Booleans coerce to 1/0 numerically.
// =============================================================================

import { FormulaError, DIV_ZERO, VALUE_ERROR } from './errors';

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

/**
 * Like `toNumber`, but returns `bigint` whenever the value fits in
 * one losslessly — preserving precision beyond `Number.MAX_SAFE_INTEGER`
 * (2^53 - 1). Used by arithmetic that opts into the BigInt path
 * (v0.0.10 item 3).
 *
 * Rules:
 *   bigint    → bigint
 *   integer Number within safe range → number (no conversion needed)
 *   integer Number outside safe range → bigint via `BigInt(v)`
 *   non-integer Number → number (BigInt can't represent it)
 *   boolean   → 0n / 1n
 *   string of integer digits → bigint
 *   anything else → falls back to toNumber semantics
 */
export function toNumeric(v: unknown): number | bigint | FormulaError {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number') {
    if (Number.isInteger(v) && !Number.isSafeInteger(v) && Number.isFinite(v)) {
      // Past 2^53 — promote to bigint to preserve precision.
      return BigInt(v);
    }
    return v;
  }
  if (typeof v === 'boolean') return v ? 1n : 0n;
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'string') {
    const s = v.trim();
    // All-digit (optional leading +/-) → bigint
    if (/^[+-]?\d+$/.test(s)) {
      try {
        return BigInt(s);
      } catch {
        return VALUE_ERROR;
      }
    }
    const n = Number(s);
    if (Number.isFinite(n)) return n;
    return VALUE_ERROR;
  }
  if (v instanceof FormulaError) return v;
  if (v instanceof Date) return v.getTime();
  return VALUE_ERROR;
}

/**
 * Add two values preserving BigInt precision when BOTH sides can be
 * represented as bigint. Promotes to Number otherwise (mixing with
 * non-integer floats; one bigint plus one float forces the float path).
 */
function arithmetic(
  l: unknown,
  r: unknown,
  intOp: (a: bigint, b: bigint) => bigint,
  floatOp: (a: number, b: number) => number,
): number | bigint | FormulaError {
  const a = toNumeric(l);
  if (a instanceof FormulaError) return a;
  const b = toNumeric(r);
  if (b instanceof FormulaError) return b;
  if (typeof a === 'bigint' && typeof b === 'bigint') {
    try {
      return intOp(a, b);
    } catch {
      return VALUE_ERROR;
    }
  }
  // Mixed → Number arithmetic. Lossy for >2^53 bigints, but matches
  // Excel's behavior at the boundary (Excel itself caps at ~2^53).
  const af = typeof a === 'bigint' ? Number(a) : a;
  const bf = typeof b === 'bigint' ? Number(b) : b;
  return floatOp(af, bf);
}

export function addNumeric(l: unknown, r: unknown): number | bigint | FormulaError {
  return arithmetic(l, r, (a, b) => a + b, (a, b) => a + b);
}
export function subNumeric(l: unknown, r: unknown): number | bigint | FormulaError {
  return arithmetic(l, r, (a, b) => a - b, (a, b) => a - b);
}
export function mulNumeric(l: unknown, r: unknown): number | bigint | FormulaError {
  return arithmetic(l, r, (a, b) => a * b, (a, b) => a * b);
}
/**
 * Division falls back to Number unless both sides are bigint AND the
 * dividend is evenly divisible by the divisor — bigint can't
 * represent fractions.
 */
export function divNumeric(l: unknown, r: unknown): number | bigint | FormulaError {
  const a = toNumeric(l);
  if (a instanceof FormulaError) return a;
  const b = toNumeric(r);
  if (b instanceof FormulaError) return b;
  if (typeof b === 'bigint' && b === 0n) return DIV_ZERO;
  if (typeof b === 'number' && b === 0) return DIV_ZERO;
  if (typeof a === 'bigint' && typeof b === 'bigint') {
    if (a % b === 0n) return a / b;
    // Non-exact — fall through to float.
  }
  const af = typeof a === 'bigint' ? Number(a) : a;
  const bf = typeof b === 'bigint' ? Number(b) : b;
  return af / bf;
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
