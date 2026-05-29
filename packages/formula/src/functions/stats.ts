// =============================================================================
// Statistics category (v1.1.0).
//
// Conditional aggregates (*IF / *IFS) use the shared `matchesCriterion`
// helper from _shared which honors Excel's wildcard (* / ?) and
// comparison-prefix (">=", "<>", etc.) syntax on criteria strings.
// =============================================================================

import { toBoolean, toNumber } from '../coerce';
import { DIV_ZERO, NA_ERROR, NUM_ERROR, VALUE_ERROR, isFormulaError } from '../errors';
import {
  flattenNumbers,
  getFunction,
  matchesCriterion,
  multiIf,
  pairedIf,
  register,
} from './_shared';

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

register('STDEV.S', (args) => {
  const f = flattenNumbers(args);
  if (f.error) return f.error;
  if (f.values.length < 2) return DIV_ZERO;
  const m = f.values.reduce((a, b) => a + b, 0) / f.values.length;
  const v = f.values.reduce((a, b) => a + (b - m) * (b - m), 0) / (f.values.length - 1);
  return Math.sqrt(v);
});

register('STDEV.P', (args) => {
  const f = flattenNumbers(args);
  if (f.error) return f.error;
  if (f.values.length === 0) return DIV_ZERO;
  const m = f.values.reduce((a, b) => a + b, 0) / f.values.length;
  const v = f.values.reduce((a, b) => a + (b - m) * (b - m), 0) / f.values.length;
  return Math.sqrt(v);
});

register('VAR.S', (args) => {
  const f = flattenNumbers(args);
  if (f.error) return f.error;
  if (f.values.length < 2) return DIV_ZERO;
  const m = f.values.reduce((a, b) => a + b, 0) / f.values.length;
  return f.values.reduce((a, b) => a + (b - m) * (b - m), 0) / (f.values.length - 1);
});

register('VAR.P', (args) => {
  const f = flattenNumbers(args);
  if (f.error) return f.error;
  if (f.values.length === 0) return DIV_ZERO;
  const m = f.values.reduce((a, b) => a + b, 0) / f.values.length;
  return f.values.reduce((a, b) => a + (b - m) * (b - m), 0) / f.values.length;
});

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
  const sorted = desc === 0
    ? [...f.values].sort((a, b) => b - a)
    : [...f.values].sort((a, b) => a - b);
  const idx = sorted.indexOf(x);
  return idx < 0 ? NA_ERROR : idx + 1;
});

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

register('QUARTILE.INC', (args) => {
  const quart = toNumber(args[1]);
  if (isFormulaError(quart)) return quart;
  const q = Math.trunc(quart);
  if (q < 0 || q > 4) return NUM_ERROR;
  const inner = getFunction('PERCENTILE.INC')!;
  return inner([args[0], q / 4]);
});

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

register('SLOPE', (args) => {
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

// ----- Conditional aggregates -----

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

register('SUMIFS', (args) =>
  multiIf(args[0], args.slice(1), (kept) => kept.reduce((a, b) => a + b, 0)),
);

register('AVERAGEIFS', (args) =>
  multiIf(args[0], args.slice(1), (kept) =>
    kept.length === 0 ? DIV_ZERO : kept.reduce((a, b) => a + b, 0) / kept.length,
  ),
);

register('COUNTIFS', (args) => {
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
// Higher moments (skew / kurtosis / standard error of estimate) — v1.1.0
// -----------------------------------------------------------------------------

register('SKEW', (args) => {
  const f = flattenNumbers(args);
  if (f.error) return f.error;
  const n = f.values.length;
  if (n < 3) return DIV_ZERO;
  const m = f.values.reduce((a, b) => a + b, 0) / n;
  let m2 = 0, m3 = 0;
  for (const v of f.values) {
    const d = v - m;
    m2 += d * d;
    m3 += d * d * d;
  }
  const s = Math.sqrt(m2 / (n - 1));
  if (s === 0) return DIV_ZERO;
  // Excel's biased-corrected sample skewness.
  return (n / ((n - 1) * (n - 2))) * (m3 / Math.pow(s, 3));
});

register('KURT', (args) => {
  const f = flattenNumbers(args);
  if (f.error) return f.error;
  const n = f.values.length;
  if (n < 4) return DIV_ZERO;
  const m = f.values.reduce((a, b) => a + b, 0) / n;
  let m2 = 0, m4 = 0;
  for (const v of f.values) {
    const d = v - m;
    m2 += d * d;
    m4 += d * d * d * d;
  }
  const s2 = m2 / (n - 1);
  if (s2 === 0) return DIV_ZERO;
  // Excel's biased-corrected excess kurtosis.
  const a = (n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3));
  const b = (3 * (n - 1) * (n - 1)) / ((n - 2) * (n - 3));
  return a * (m4 / (s2 * s2)) - b;
});

register('STEYX', (args) => {
  // Standard error of the predicted y for each x in a linear regression.
  const ys = flattenNumbers([args[0]]);
  const xs = flattenNumbers([args[1]]);
  if (ys.error) return ys.error;
  if (xs.error) return xs.error;
  const n = xs.values.length;
  if (n !== ys.values.length || n < 3) return DIV_ZERO;
  const mx = xs.values.reduce((a, b) => a + b, 0) / n;
  const my = ys.values.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs.values[i]! - mx;
    const dy = ys.values[i]! - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0) return DIV_ZERO;
  return Math.sqrt((syy - (sxy * sxy) / sxx) / (n - 2));
});

// -----------------------------------------------------------------------------
// Numerical primitives — error function, log-gamma, regularized incomplete
// gamma + beta. These power the continuous + discrete distributions below.
//
// Precision targets: ~1e-8 absolute, matching or beating Excel's published
// tolerances for the dist functions. Algorithms:
//   - erf: Abramowitz & Stegun 7.1.26 (~1.5e-7 max error).
//   - erfInv: Winitzki rational approximation + one Halley step.
//   - gammaLn: Lanczos g=7 with Spouge-style coefficients.
//   - regGamma (P(a,x)): power series for x < a+1, Lentz CF otherwise.
//   - regBeta (I_x(a,b)): modified Lentz continued fraction (NR §6.4).
// -----------------------------------------------------------------------------

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const p = 0.3275911;
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429;
  const t = 1 / (1 + p * ax);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}

function erfInv(x: number): number {
  // Winitzki 2008 approximation then one Halley refinement.
  if (x <= -1 || x >= 1) return x < 0 ? -Infinity : Infinity;
  const a = 0.147;
  const ln1mxx = Math.log(1 - x * x);
  const half = 2 / (Math.PI * a) + ln1mxx / 2;
  const sign = x < 0 ? -1 : 1;
  let y = sign * Math.sqrt(Math.sqrt(half * half - ln1mxx / a) - half);
  // One Halley iteration on erf(y) = x.
  const e = erf(y) - x;
  const dy = 2 / Math.sqrt(Math.PI) * Math.exp(-y * y);
  y -= e / dy;
  return y;
}

const LANCZOS_G = 7;
const LANCZOS_C = [
  0.99999999999980993,
  676.5203681218851,
  -1259.1392167224028,
  771.32342877765313,
  -176.61502916214059,
  12.507343278686905,
  -0.13857109526572012,
  9.9843695780195716e-6,
  1.5056327351493116e-7,
];

function gammaLn(z: number): number {
  if (z < 0.5) {
    // Reflection: Γ(z)Γ(1-z) = π / sin(πz).
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - gammaLn(1 - z);
  }
  z -= 1;
  let x = LANCZOS_C[0]!;
  for (let i = 1; i < LANCZOS_G + 2; i++) x += LANCZOS_C[i]! / (z + i);
  const t = z + LANCZOS_G + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function gammaFn(x: number): number {
  return Math.exp(gammaLn(x));
}

function regGamma(a: number, x: number): number {
  // Regularized lower incomplete gamma P(a, x) = γ(a, x) / Γ(a).
  if (x < 0 || a <= 0) return NaN;
  if (x === 0) return 0;
  if (x < a + 1) {
    // Power series.
    let ap = a;
    let sum = 1 / a;
    let term = sum;
    for (let n = 1; n < 200; n++) {
      ap += 1;
      term *= x / ap;
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-12) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - gammaLn(a));
  }
  // Continued fraction (Lentz).
  let b = x + 1 - a;
  let c = 1e300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 200; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  const q = Math.exp(-x + a * Math.log(x) - gammaLn(a)) * h;
  return 1 - q;
}

function regBeta(a: number, b: number, x: number): number {
  // Regularized incomplete beta I_x(a, b). NR §6.4 algorithm.
  if (x < 0 || x > 1) return NaN;
  if (x === 0) return 0;
  if (x === 1) return 1;
  const bt = Math.exp(
    gammaLn(a + b) - gammaLn(a) - gammaLn(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  const cont = (aa: number, bb: number, xx: number): number => {
    const qab = aa + bb, qap = aa + 1, qam = aa - 1;
    let c = 1;
    let d = 1 - (qab * xx) / qap;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    d = 1 / d;
    let h = d;
    for (let m = 1; m < 200; m++) {
      const m2 = 2 * m;
      let aaa = (m * (bb - m) * xx) / ((qam + m2) * (aa + m2));
      d = 1 + aaa * d;
      if (Math.abs(d) < 1e-300) d = 1e-300;
      c = 1 + aaa / c;
      if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d;
      h *= d * c;
      aaa = (-(aa + m) * (qab + m) * xx) / ((aa + m2) * (qap + m2));
      d = 1 + aaa * d;
      if (Math.abs(d) < 1e-300) d = 1e-300;
      c = 1 + aaa / c;
      if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < 1e-12) break;
    }
    return h;
  };
  // Use the symmetry I_x(a,b) = 1 - I_(1-x)(b,a) when x is past a/(a+b).
  if (x < (a + 1) / (a + b + 2)) {
    return (bt * cont(a, b, x)) / a;
  }
  return 1 - (bt * cont(b, a, 1 - x)) / b;
}

function bisectInverse(
  cdf: (x: number) => number,
  p: number,
  lo: number,
  hi: number,
): number {
  // Bracketed inverse via bisection. Caller guarantees cdf(lo) <= p <= cdf(hi).
  let a = lo, b = hi;
  for (let i = 0; i < 100; i++) {
    const m = (a + b) / 2;
    const fm = cdf(m);
    if (fm < p) a = m;
    else b = m;
    if (b - a < 1e-12 * (Math.abs(m) + 1)) return m;
  }
  return (a + b) / 2;
}

// -----------------------------------------------------------------------------
// Continuous distributions (v1.1.0)
// -----------------------------------------------------------------------------

register('GAMMALN', (args) => {
  const n = toNumber(args[0]);
  if (isFormulaError(n)) return n;
  if (n <= 0) return NUM_ERROR;
  return gammaLn(n);
});

register('GAMMA', (args) => {
  const n = toNumber(args[0]);
  if (isFormulaError(n)) return n;
  if (n <= 0 && Number.isInteger(n)) return NUM_ERROR;
  return gammaFn(n);
});

register('NORM.S.DIST', (args) => {
  const z = toNumber(args[0]);
  if (isFormulaError(z)) return z;
  const cumulative = args.length > 1 ? toBoolean(args[1]) : true;
  if (isFormulaError(cumulative)) return cumulative;
  if (cumulative) return 0.5 * (1 + erf(z / Math.sqrt(2)));
  return Math.exp(-(z * z) / 2) / Math.sqrt(2 * Math.PI);
});

register('NORMSDIST', (args) => {
  // Legacy single-arg form: cumulative only.
  const z = toNumber(args[0]);
  if (isFormulaError(z)) return z;
  return 0.5 * (1 + erf(z / Math.sqrt(2)));
});

register('NORM.DIST', (args) => {
  const x = toNumber(args[0]);
  const mean = toNumber(args[1]);
  const sd = toNumber(args[2]);
  if (isFormulaError(x)) return x;
  if (isFormulaError(mean)) return mean;
  if (isFormulaError(sd)) return sd;
  if (sd <= 0) return NUM_ERROR;
  const cumulative = args.length > 3 ? toBoolean(args[3]) : true;
  if (isFormulaError(cumulative)) return cumulative;
  const z = (x - mean) / sd;
  if (cumulative) return 0.5 * (1 + erf(z / Math.sqrt(2)));
  return Math.exp(-(z * z) / 2) / (sd * Math.sqrt(2 * Math.PI));
});

register('NORM.S.INV', (args) => {
  const p = toNumber(args[0]);
  if (isFormulaError(p)) return p;
  if (p <= 0 || p >= 1) return NUM_ERROR;
  return Math.sqrt(2) * erfInv(2 * p - 1);
});

register('NORMSINV', (args) => {
  const inner = getFunction('NORM.S.INV')!;
  return inner(args);
});

register('NORM.INV', (args) => {
  const p = toNumber(args[0]);
  const mean = toNumber(args[1]);
  const sd = toNumber(args[2]);
  if (isFormulaError(p)) return p;
  if (isFormulaError(mean)) return mean;
  if (isFormulaError(sd)) return sd;
  if (sd <= 0 || p <= 0 || p >= 1) return NUM_ERROR;
  return mean + sd * Math.sqrt(2) * erfInv(2 * p - 1);
});

register('EXPON.DIST', (args) => {
  const x = toNumber(args[0]);
  const lambda = toNumber(args[1]);
  if (isFormulaError(x)) return x;
  if (isFormulaError(lambda)) return lambda;
  if (x < 0 || lambda <= 0) return NUM_ERROR;
  const cumulative = args.length > 2 ? toBoolean(args[2]) : true;
  if (isFormulaError(cumulative)) return cumulative;
  if (cumulative) return 1 - Math.exp(-lambda * x);
  return lambda * Math.exp(-lambda * x);
});

register('GAMMA.DIST', (args) => {
  const x = toNumber(args[0]);
  const alpha = toNumber(args[1]);
  const beta = toNumber(args[2]);
  if (isFormulaError(x)) return x;
  if (isFormulaError(alpha)) return alpha;
  if (isFormulaError(beta)) return beta;
  if (alpha <= 0 || beta <= 0 || x < 0) return NUM_ERROR;
  const cumulative = args.length > 3 ? toBoolean(args[3]) : true;
  if (isFormulaError(cumulative)) return cumulative;
  if (cumulative) return regGamma(alpha, x / beta);
  return (
    Math.exp(-x / beta) *
    Math.pow(x / beta, alpha - 1) /
    (beta * gammaFn(alpha))
  );
});

register('GAMMA.INV', (args) => {
  const p = toNumber(args[0]);
  const alpha = toNumber(args[1]);
  const beta = toNumber(args[2]);
  if (isFormulaError(p)) return p;
  if (isFormulaError(alpha)) return alpha;
  if (isFormulaError(beta)) return beta;
  if (p <= 0 || p >= 1 || alpha <= 0 || beta <= 0) return NUM_ERROR;
  // Inverse via bisection on regGamma.
  let hi = beta * alpha;
  while (regGamma(alpha, hi / beta) < p) hi *= 2;
  return bisectInverse((x) => regGamma(alpha, x / beta), p, 0, hi);
});

register('BETA.DIST', (args) => {
  const x = toNumber(args[0]);
  const alpha = toNumber(args[1]);
  const beta = toNumber(args[2]);
  if (isFormulaError(x)) return x;
  if (isFormulaError(alpha)) return alpha;
  if (isFormulaError(beta)) return beta;
  const cumulative = args.length > 3 ? toBoolean(args[3]) : true;
  if (isFormulaError(cumulative)) return cumulative;
  const lo = args.length > 4 ? toNumber(args[4]) : 0;
  if (isFormulaError(lo)) return lo;
  const hi = args.length > 5 ? toNumber(args[5]) : 1;
  if (isFormulaError(hi)) return hi;
  if (alpha <= 0 || beta <= 0 || x < lo || x > hi || hi <= lo) return NUM_ERROR;
  const t = (x - lo) / (hi - lo);
  if (cumulative) return regBeta(alpha, beta, t);
  // PDF on [lo, hi].
  const logp =
    gammaLn(alpha + beta) -
    gammaLn(alpha) -
    gammaLn(beta) +
    (alpha - 1) * Math.log(t) +
    (beta - 1) * Math.log(1 - t);
  return Math.exp(logp) / (hi - lo);
});

register('BETA.INV', (args) => {
  const p = toNumber(args[0]);
  const alpha = toNumber(args[1]);
  const beta = toNumber(args[2]);
  if (isFormulaError(p)) return p;
  if (isFormulaError(alpha)) return alpha;
  if (isFormulaError(beta)) return beta;
  const lo = args.length > 3 ? toNumber(args[3]) : 0;
  if (isFormulaError(lo)) return lo;
  const hi = args.length > 4 ? toNumber(args[4]) : 1;
  if (isFormulaError(hi)) return hi;
  if (p <= 0 || p >= 1 || alpha <= 0 || beta <= 0 || hi <= lo) return NUM_ERROR;
  const t = bisectInverse((x) => regBeta(alpha, beta, x), p, 0, 1);
  return lo + t * (hi - lo);
});

register('CHISQ.DIST', (args) => {
  const x = toNumber(args[0]);
  const df = toNumber(args[1]);
  if (isFormulaError(x)) return x;
  if (isFormulaError(df)) return df;
  if (df <= 0 || x < 0) return NUM_ERROR;
  const cumulative = args.length > 2 ? toBoolean(args[2]) : true;
  if (isFormulaError(cumulative)) return cumulative;
  if (cumulative) return regGamma(df / 2, x / 2);
  if (x === 0) return df < 2 ? Infinity : df === 2 ? 0.5 : 0;
  return (
    Math.exp(-x / 2) * Math.pow(x, df / 2 - 1) / (Math.pow(2, df / 2) * gammaFn(df / 2))
  );
});

register('CHISQ.DIST.RT', (args) => {
  const x = toNumber(args[0]);
  const df = toNumber(args[1]);
  if (isFormulaError(x)) return x;
  if (isFormulaError(df)) return df;
  if (df <= 0 || x < 0) return NUM_ERROR;
  return 1 - regGamma(df / 2, x / 2);
});

register('CHISQ.INV', (args) => {
  const p = toNumber(args[0]);
  const df = toNumber(args[1]);
  if (isFormulaError(p)) return p;
  if (isFormulaError(df)) return df;
  if (p <= 0 || p >= 1 || df <= 0) return NUM_ERROR;
  // CHISQ.INV(p, df) = 2 * GAMMA.INV(p, df/2, 1)
  const inner = getFunction('GAMMA.INV')!;
  const r = inner([p, df / 2, 2]);
  return r;
});

register('CHISQ.INV.RT', (args) => {
  const p = toNumber(args[0]);
  const df = toNumber(args[1]);
  if (isFormulaError(p)) return p;
  if (isFormulaError(df)) return df;
  if (p <= 0 || p >= 1 || df <= 0) return NUM_ERROR;
  const inner = getFunction('CHISQ.INV')!;
  return inner([1 - p, df]);
});

register('T.DIST', (args) => {
  const x = toNumber(args[0]);
  const df = toNumber(args[1]);
  if (isFormulaError(x)) return x;
  if (isFormulaError(df)) return df;
  if (df <= 0) return NUM_ERROR;
  const cumulative = args.length > 2 ? toBoolean(args[2]) : true;
  if (isFormulaError(cumulative)) return cumulative;
  if (cumulative) {
    // F(x) = 1 - 0.5 * I_(df/(df+x²))(df/2, 1/2) for x ≥ 0; symmetric otherwise.
    const a = df / 2, b = 0.5;
    const t = df / (df + x * x);
    const half = 0.5 * regBeta(a, b, t);
    return x >= 0 ? 1 - half : half;
  }
  const logp =
    gammaLn((df + 1) / 2) -
    gammaLn(df / 2) -
    0.5 * Math.log(df * Math.PI) -
    ((df + 1) / 2) * Math.log(1 + (x * x) / df);
  return Math.exp(logp);
});

register('T.DIST.2T', (args) => {
  const x = toNumber(args[0]);
  const df = toNumber(args[1]);
  if (isFormulaError(x)) return x;
  if (isFormulaError(df)) return df;
  if (df <= 0 || x < 0) return NUM_ERROR;
  const a = df / 2, b = 0.5;
  const t = df / (df + x * x);
  return regBeta(a, b, t);
});

register('T.DIST.RT', (args) => {
  const x = toNumber(args[0]);
  const df = toNumber(args[1]);
  if (isFormulaError(x)) return x;
  if (isFormulaError(df)) return df;
  if (df <= 0) return NUM_ERROR;
  const inner = getFunction('T.DIST')!;
  const cdf = inner([x, df, true]);
  if (isFormulaError(cdf)) return cdf;
  return 1 - (cdf as number);
});

register('T.INV', (args) => {
  const p = toNumber(args[0]);
  const df = toNumber(args[1]);
  if (isFormulaError(p)) return p;
  if (isFormulaError(df)) return df;
  if (p <= 0 || p >= 1 || df <= 0) return NUM_ERROR;
  const inner = getFunction('T.DIST')!;
  // Symmetric distribution: bracket [-50, 50] is enough for sane df.
  const cdf = (x: number): number => inner([x, df, true]) as number;
  return bisectInverse(cdf, p, -50, 50);
});

register('T.INV.2T', (args) => {
  const p = toNumber(args[0]);
  const df = toNumber(args[1]);
  if (isFormulaError(p)) return p;
  if (isFormulaError(df)) return df;
  if (p <= 0 || p > 1 || df <= 0) return NUM_ERROR;
  // 2T means two-tailed probability — find x such that 2*(1 - F(x)) = p, x > 0.
  const inner = getFunction('T.INV')!;
  return inner([1 - p / 2, df]);
});

register('F.DIST', (args) => {
  const x = toNumber(args[0]);
  const d1 = toNumber(args[1]);
  const d2 = toNumber(args[2]);
  if (isFormulaError(x)) return x;
  if (isFormulaError(d1)) return d1;
  if (isFormulaError(d2)) return d2;
  if (d1 <= 0 || d2 <= 0 || x < 0) return NUM_ERROR;
  const cumulative = args.length > 3 ? toBoolean(args[3]) : true;
  if (isFormulaError(cumulative)) return cumulative;
  if (cumulative) {
    return regBeta(d1 / 2, d2 / 2, (d1 * x) / (d1 * x + d2));
  }
  // PDF.
  const num = Math.pow(d1 * x, d1) * Math.pow(d2, d2);
  const den = Math.pow(d1 * x + d2, d1 + d2);
  return Math.sqrt(num / den) / (x * Math.exp(gammaLn(d1 / 2) + gammaLn(d2 / 2) - gammaLn((d1 + d2) / 2)));
});

register('F.DIST.RT', (args) => {
  const x = toNumber(args[0]);
  const d1 = toNumber(args[1]);
  const d2 = toNumber(args[2]);
  if (isFormulaError(x)) return x;
  if (isFormulaError(d1)) return d1;
  if (isFormulaError(d2)) return d2;
  if (d1 <= 0 || d2 <= 0 || x <= 0) return NUM_ERROR;
  return 1 - regBeta(d1 / 2, d2 / 2, (d1 * x) / (d1 * x + d2));
});

register('F.INV', (args) => {
  const p = toNumber(args[0]);
  const d1 = toNumber(args[1]);
  const d2 = toNumber(args[2]);
  if (isFormulaError(p)) return p;
  if (isFormulaError(d1)) return d1;
  if (isFormulaError(d2)) return d2;
  if (p <= 0 || p >= 1 || d1 <= 0 || d2 <= 0) return NUM_ERROR;
  const inner = getFunction('F.DIST')!;
  let hi = 1;
  while ((inner([hi, d1, d2, true]) as number) < p) hi *= 2;
  return bisectInverse((x) => inner([x, d1, d2, true]) as number, p, 0, hi);
});

register('F.INV.RT', (args) => {
  const p = toNumber(args[0]);
  const d1 = toNumber(args[1]);
  const d2 = toNumber(args[2]);
  if (isFormulaError(p)) return p;
  if (isFormulaError(d1)) return d1;
  if (isFormulaError(d2)) return d2;
  if (p <= 0 || p >= 1 || d1 <= 0 || d2 <= 0) return NUM_ERROR;
  const inner = getFunction('F.INV')!;
  return inner([1 - p, d1, d2]);
});

register('LOGNORM.DIST', (args) => {
  const x = toNumber(args[0]);
  const mean = toNumber(args[1]);
  const sd = toNumber(args[2]);
  if (isFormulaError(x)) return x;
  if (isFormulaError(mean)) return mean;
  if (isFormulaError(sd)) return sd;
  if (sd <= 0 || x <= 0) return NUM_ERROR;
  const cumulative = args.length > 3 ? toBoolean(args[3]) : true;
  if (isFormulaError(cumulative)) return cumulative;
  const z = (Math.log(x) - mean) / sd;
  if (cumulative) return 0.5 * (1 + erf(z / Math.sqrt(2)));
  return Math.exp(-(z * z) / 2) / (x * sd * Math.sqrt(2 * Math.PI));
});

register('LOGNORM.INV', (args) => {
  const p = toNumber(args[0]);
  const mean = toNumber(args[1]);
  const sd = toNumber(args[2]);
  if (isFormulaError(p)) return p;
  if (isFormulaError(mean)) return mean;
  if (isFormulaError(sd)) return sd;
  if (p <= 0 || p >= 1 || sd <= 0) return NUM_ERROR;
  return Math.exp(mean + sd * Math.sqrt(2) * erfInv(2 * p - 1));
});

register('WEIBULL.DIST', (args) => {
  const x = toNumber(args[0]);
  const alpha = toNumber(args[1]);
  const beta = toNumber(args[2]);
  if (isFormulaError(x)) return x;
  if (isFormulaError(alpha)) return alpha;
  if (isFormulaError(beta)) return beta;
  if (alpha <= 0 || beta <= 0 || x < 0) return NUM_ERROR;
  const cumulative = args.length > 3 ? toBoolean(args[3]) : true;
  if (isFormulaError(cumulative)) return cumulative;
  if (cumulative) return 1 - Math.exp(-Math.pow(x / beta, alpha));
  return (alpha / beta) * Math.pow(x / beta, alpha - 1) * Math.exp(-Math.pow(x / beta, alpha));
});

// -----------------------------------------------------------------------------
// Discrete distributions
// -----------------------------------------------------------------------------

function binomLogPmf(k: number, n: number, p: number): number {
  if (p <= 0) return k === 0 ? 0 : -Infinity;
  if (p >= 1) return k === n ? 0 : -Infinity;
  return (
    gammaLn(n + 1) -
    gammaLn(k + 1) -
    gammaLn(n - k + 1) +
    k * Math.log(p) +
    (n - k) * Math.log(1 - p)
  );
}

register('BINOM.DIST', (args) => {
  const k = toNumber(args[0]);
  const n = toNumber(args[1]);
  const p = toNumber(args[2]);
  if (isFormulaError(k)) return k;
  if (isFormulaError(n)) return n;
  if (isFormulaError(p)) return p;
  if (n < 0 || k < 0 || k > n || p < 0 || p > 1) return NUM_ERROR;
  const ki = Math.trunc(k);
  const ni = Math.trunc(n);
  const cumulative = args.length > 3 ? toBoolean(args[3]) : true;
  if (isFormulaError(cumulative)) return cumulative;
  if (!cumulative) return Math.exp(binomLogPmf(ki, ni, p));
  // F(k) = I_(1-p)(n-k, k+1)
  if (ki === ni) return 1;
  if (ki < 0) return 0;
  return regBeta(ni - ki, ki + 1, 1 - p);
});

register('BINOM.INV', (args) => {
  const n = toNumber(args[0]);
  const p = toNumber(args[1]);
  const alpha = toNumber(args[2]);
  if (isFormulaError(n)) return n;
  if (isFormulaError(p)) return p;
  if (isFormulaError(alpha)) return alpha;
  if (n < 0 || p < 0 || p > 1 || alpha < 0 || alpha > 1) return NUM_ERROR;
  const ni = Math.trunc(n);
  let cum = 0;
  for (let k = 0; k <= ni; k++) {
    cum += Math.exp(binomLogPmf(k, ni, p));
    if (cum >= alpha) return k;
  }
  return ni;
});

register('BINOM.DIST.RANGE', (args) => {
  const n = toNumber(args[0]);
  const p = toNumber(args[1]);
  const s1 = toNumber(args[2]);
  if (isFormulaError(n)) return n;
  if (isFormulaError(p)) return p;
  if (isFormulaError(s1)) return s1;
  const s2 = args.length > 3 ? toNumber(args[3]) : s1;
  if (isFormulaError(s2)) return s2;
  if (n < 0 || p < 0 || p > 1 || s1 < 0 || s2 < s1 || s2 > n) return NUM_ERROR;
  const ni = Math.trunc(n);
  const a = Math.trunc(s1), b = Math.trunc(s2);
  let total = 0;
  for (let k = a; k <= b; k++) total += Math.exp(binomLogPmf(k, ni, p));
  return total;
});

register('POISSON.DIST', (args) => {
  const k = toNumber(args[0]);
  const lambda = toNumber(args[1]);
  if (isFormulaError(k)) return k;
  if (isFormulaError(lambda)) return lambda;
  if (k < 0 || lambda < 0) return NUM_ERROR;
  const ki = Math.trunc(k);
  const cumulative = args.length > 2 ? toBoolean(args[2]) : true;
  if (isFormulaError(cumulative)) return cumulative;
  if (!cumulative) {
    return Math.exp(-lambda + ki * Math.log(lambda) - gammaLn(ki + 1));
  }
  // F(k) = Q(k+1, lambda) where Q is the upper regularized gamma.
  return 1 - regGamma(ki + 1, lambda);
});

register('HYPGEOM.DIST', (args) => {
  // HYPGEOM.DIST(sample_s, number_sample, population_s, number_pop, cumulative)
  const k = toNumber(args[0]);
  const N = toNumber(args[1]);
  const K = toNumber(args[2]);
  const M = toNumber(args[3]);
  if (isFormulaError(k)) return k;
  if (isFormulaError(N)) return N;
  if (isFormulaError(K)) return K;
  if (isFormulaError(M)) return M;
  if (k < 0 || N < 0 || K < 0 || M < 0 || k > N || k > K || N > M || K > M) return NUM_ERROR;
  const cumulative = args.length > 4 ? toBoolean(args[4]) : true;
  if (isFormulaError(cumulative)) return cumulative;
  const pmf = (kk: number): number =>
    Math.exp(
      gammaLn(K + 1) - gammaLn(kk + 1) - gammaLn(K - kk + 1) +
        gammaLn(M - K + 1) - gammaLn(N - kk + 1) - gammaLn(M - K - N + kk + 1) -
        (gammaLn(M + 1) - gammaLn(N + 1) - gammaLn(M - N + 1)),
    );
  const ki = Math.trunc(k);
  if (!cumulative) return pmf(ki);
  let total = 0;
  for (let i = Math.max(0, Math.trunc(N) - Math.trunc(M) + Math.trunc(K)); i <= ki; i++) {
    total += pmf(i);
  }
  return total;
});

register('NEGBINOM.DIST', (args) => {
  // NEGBINOM.DIST(number_failures, number_successes, prob_success, cumulative)
  const f = toNumber(args[0]);
  const s = toNumber(args[1]);
  const p = toNumber(args[2]);
  if (isFormulaError(f)) return f;
  if (isFormulaError(s)) return s;
  if (isFormulaError(p)) return p;
  if (f < 0 || s < 1 || p <= 0 || p >= 1) return NUM_ERROR;
  const fi = Math.trunc(f);
  const si = Math.trunc(s);
  const cumulative = args.length > 3 ? toBoolean(args[3]) : false;
  if (isFormulaError(cumulative)) return cumulative;
  const pmf = (k: number): number =>
    Math.exp(
      gammaLn(k + si) - gammaLn(k + 1) - gammaLn(si) + si * Math.log(p) + k * Math.log(1 - p),
    );
  if (!cumulative) return pmf(fi);
  let total = 0;
  for (let k = 0; k <= fi; k++) total += pmf(k);
  return total;
});

// -----------------------------------------------------------------------------
// Regression / forecasting
// -----------------------------------------------------------------------------

register('FORECAST.LINEAR', (args) => {
  // FORECAST.LINEAR(x, known_ys, known_xs)
  const x = toNumber(args[0]);
  if (isFormulaError(x)) return x;
  const slope = getFunction('SLOPE')!([args[1], args[2]]);
  if (isFormulaError(slope)) return slope;
  const intercept = getFunction('INTERCEPT')!([args[1], args[2]]);
  if (isFormulaError(intercept)) return intercept;
  return (intercept as number) + (slope as number) * x;
});

register('TREND', (args) => {
  // TREND(known_ys, [known_xs], [new_xs], [const]) — simple-LR variant.
  // We support the common 1D form with required new_xs.
  const ys = args[0];
  const xs = args.length > 1 && args[1] !== undefined ? args[1] : null;
  const newXs = args.length > 2 && args[2] !== undefined ? args[2] : null;
  if (xs === null || newXs === null) return VALUE_ERROR;
  const slope = getFunction('SLOPE')!([ys, xs]);
  if (isFormulaError(slope)) return slope;
  const intercept = getFunction('INTERCEPT')!([ys, xs]);
  if (isFormulaError(intercept)) return intercept;
  const flat = (() => {
    if (Array.isArray(newXs) && newXs.length > 0 && Array.isArray(newXs[0])) {
      return (newXs as unknown[][]).flat();
    }
    return Array.isArray(newXs) ? (newXs as unknown[]) : [newXs];
  })();
  const result: number[][] = [];
  for (const v of flat) {
    const n = toNumber(v);
    if (isFormulaError(n)) return n;
    result.push([(intercept as number) + (slope as number) * n]);
  }
  return result;
});

// Silence unused-symbol warnings for sentinels imported but not directly used
// inside this file (they're surfaced through tests via getFunction).
void NA_ERROR;
