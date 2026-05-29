// =============================================================================
// Math additions (v1.1.0 wave 10) — completeness for Excel parity beyond the
// initial math.ts surface. Quotient/double-factorial/multinomial/series/
// sum-of-pairs operations, roman-numeral conversion, arbitrary-base
// conversion, RANDARRAY.
// =============================================================================

import { toNumber } from '../coerce';
import { type FormulaError, NUM_ERROR, VALUE_ERROR, isFormulaError } from '../errors';
import { flattenNumbers, register } from './_shared';

function asNum(v: unknown): number | FormulaError {
  if (v === null || v === undefined || v === '') return 0;
  return toNumber(v);
}

register('QUOTIENT', (args) => {
  const num = asNum(args[0]);
  if (isFormulaError(num)) return num;
  const den = asNum(args[1]);
  if (isFormulaError(den)) return den;
  if (den === 0) return NUM_ERROR;
  return Math.trunc(num / den);
});

register('FACTDOUBLE', (args) => {
  const n = asNum(args[0]);
  if (isFormulaError(n)) return n;
  const k = Math.trunc(n);
  if (k < 0) return NUM_ERROR;
  if (k === 0 || k === 1) return 1;
  let r = 1;
  for (let i = k; i > 1; i -= 2) r *= i;
  return r;
});

register('MULTINOMIAL', (args) => {
  const f = flattenNumbers(args);
  if (f.error) return f.error;
  if (f.values.some((v) => v < 0 || !Number.isInteger(v))) return NUM_ERROR;
  // (sum)! / prod(k_i!)
  const sum = f.values.reduce((a, b) => a + b, 0);
  let num = 1;
  for (let i = 2; i <= sum; i++) num *= i;
  let den = 1;
  for (const k of f.values) {
    for (let i = 2; i <= k; i++) den *= i;
  }
  return num / den;
});

register('SERIESSUM', (args) => {
  const x = asNum(args[0]);
  if (isFormulaError(x)) return x;
  const n = asNum(args[1]);
  if (isFormulaError(n)) return n;
  const m = asNum(args[2]);
  if (isFormulaError(m)) return m;
  const coeffs = flattenNumbers([args[3]]);
  if (coeffs.error) return coeffs.error;
  let sum = 0;
  for (let i = 0; i < coeffs.values.length; i++) {
    sum += coeffs.values[i]! * Math.pow(x, n + i * m);
  }
  return sum;
});

function pairedSums(
  args: ReadonlyArray<unknown>,
  combine: (x: number, y: number) => number,
): number | FormulaError {
  const xArg = args[0];
  const yArg = args[1];
  const xs = flattenNumbers([xArg]);
  const ys = flattenNumbers([yArg]);
  if (xs.error) return xs.error;
  if (ys.error) return ys.error;
  if (xs.values.length !== ys.values.length) return VALUE_ERROR;
  let s = 0;
  for (let i = 0; i < xs.values.length; i++) s += combine(xs.values[i]!, ys.values[i]!);
  return s;
}

register('SUMX2MY2', (args) => pairedSums(args, (x, y) => x * x - y * y));
register('SUMX2PY2', (args) => pairedSums(args, (x, y) => x * x + y * y));
register('SUMXMY2', (args) => pairedSums(args, (x, y) => (x - y) * (x - y)));

// ----- Roman numerals --------------------------------------------------------

const ROMAN_PAIRS: ReadonlyArray<readonly [number, string]> = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

register('ROMAN', (args) => {
  const n = asNum(args[0]);
  if (isFormulaError(n)) return n;
  const k = Math.trunc(n);
  if (k < 0 || k > 3999) return VALUE_ERROR;
  let rem = k;
  let out = '';
  for (const [val, sym] of ROMAN_PAIRS) {
    while (rem >= val) {
      out += sym;
      rem -= val;
    }
  }
  return out;
});

register('ARABIC', (args) => {
  const s = args[0];
  if (s === null || s === undefined || s === '') return 0;
  const str = String(s).trim().toUpperCase();
  if (str.length === 0) return 0;
  const sign = str[0] === '-' ? -1 : 1;
  const body = sign === -1 ? str.slice(1) : str;
  if (!/^[MDCLXVI]+$/.test(body)) return VALUE_ERROR;
  const map: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  for (let i = 0; i < body.length; i++) {
    const cur = map[body[i]!]!;
    const next = i + 1 < body.length ? map[body[i + 1]!]! : 0;
    total += cur < next ? -cur : cur;
  }
  return sign * total;
});

register('BASE', (args) => {
  const n = asNum(args[0]);
  if (isFormulaError(n)) return n;
  if (n < 0 || !Number.isInteger(n)) return NUM_ERROR;
  const base = asNum(args[1]);
  if (isFormulaError(base)) return base;
  if (base < 2 || base > 36 || !Number.isInteger(base)) return NUM_ERROR;
  const minLen = args[2] === undefined || args[2] === '' ? 0 : asNum(args[2]);
  if (isFormulaError(minLen)) return minLen;
  const s = n.toString(base).toUpperCase();
  return s.padStart(Math.trunc(minLen), '0');
});

register('DECIMAL', (args) => {
  const s = args[0];
  if (s === null || s === undefined || s === '') return 0;
  const base = asNum(args[1]);
  if (isFormulaError(base)) return base;
  if (base < 2 || base > 36 || !Number.isInteger(base)) return NUM_ERROR;
  const str = String(s).trim().toUpperCase();
  const n = Number.parseInt(str, base);
  if (!Number.isFinite(n)) return NUM_ERROR;
  // Reject characters outside the base alphabet (parseInt only consumes valid prefix).
  const re = new RegExp(`^[0-9A-Z]+$`);
  if (!re.test(str)) return NUM_ERROR;
  for (const c of str) {
    const v = c >= 'A' ? c.charCodeAt(0) - 'A'.charCodeAt(0) + 10 : c.charCodeAt(0) - '0'.charCodeAt(0);
    if (v >= base) return NUM_ERROR;
  }
  return n;
});

// RANDARRAY([rows], [cols], [min], [max], [whole_number])
register('RANDARRAY', (args) => {
  const rows = args[0] === undefined || args[0] === '' ? 1 : asNum(args[0]);
  if (isFormulaError(rows)) return rows;
  const cols = args[1] === undefined || args[1] === '' ? 1 : asNum(args[1]);
  if (isFormulaError(cols)) return cols;
  const min = args[2] === undefined || args[2] === '' ? 0 : asNum(args[2]);
  if (isFormulaError(min)) return min;
  const max = args[3] === undefined || args[3] === '' ? 1 : asNum(args[3]);
  if (isFormulaError(max)) return max;
  const whole = args[4] === undefined || args[4] === '' ? false : Boolean(args[4]);
  const r = Math.trunc(rows);
  const c = Math.trunc(cols);
  if (r <= 0 || c <= 0) return VALUE_ERROR;
  const out: number[][] = [];
  for (let i = 0; i < r; i++) {
    const row: number[] = [];
    for (let j = 0; j < c; j++) {
      const v = min + Math.random() * (max - min);
      row.push(whole ? Math.floor(v) : v);
    }
    out.push(row);
  }
  if (r === 1 && c === 1) return out[0]![0];
  return out;
});
