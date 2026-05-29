// =============================================================================
// Statistics additions (v1.1.0 wave 11) — descriptive (GEOMEAN, HARMEAN,
// TRIMMEAN, DEVSQ, AVEDEV, MODE.MULT), distribution helpers (PROB, FREQUENCY,
// CONFIDENCE.NORM, CONFIDENCE.T), hypothesis tests (Z.TEST, T.TEST, F.TEST,
// CHISQ.TEST), and ordinary-least-squares regression (LINEST, LOGEST, GROWTH).
//
// Distribution-dependent functions delegate to the registered NORM.S.INV /
// T.INV.2T / F.DIST.RT / CHISQ.DIST.RT entries via getFunction — keeps the
// implementation here independent of stats.ts's internal helpers.
// =============================================================================

import { toNumber } from '../coerce';
import { DIV_ZERO, type FormulaError, NUM_ERROR, isFormulaError } from '../errors';
import { flattenNumbers, getFunction, register, to2D } from './_shared';

function callRegistered(name: string, args: unknown[]): unknown {
  const fn = getFunction(name);
  if (!fn) throw new Error(`${name} not registered`);
  return fn(args);
}

function meanOf(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function variance(xs: number[], sample: boolean): number {
  const m = meanOf(xs);
  const div = sample ? xs.length - 1 : xs.length;
  return xs.reduce((a, b) => a + (b - m) * (b - m), 0) / div;
}

// ----- Descriptive -----------------------------------------------------------

register('GEOMEAN', (args) => {
  const f = flattenNumbers(args);
  if (f.error) return f.error;
  if (f.values.length === 0) return NUM_ERROR;
  let log = 0;
  for (const v of f.values) {
    if (v <= 0) return NUM_ERROR;
    log += Math.log(v);
  }
  return Math.exp(log / f.values.length);
});

register('HARMEAN', (args) => {
  const f = flattenNumbers(args);
  if (f.error) return f.error;
  if (f.values.length === 0) return NUM_ERROR;
  let inv = 0;
  for (const v of f.values) {
    if (v <= 0) return NUM_ERROR;
    inv += 1 / v;
  }
  return f.values.length / inv;
});

register('TRIMMEAN', (args) => {
  const f = flattenNumbers([args[0]]);
  if (f.error) return f.error;
  const pct = toNumber(args[1]);
  if (isFormulaError(pct)) return pct;
  if (pct < 0 || pct >= 1) return NUM_ERROR;
  const sorted = [...f.values].sort((a, b) => a - b);
  const trim = Math.floor((sorted.length * pct) / 2);
  const kept = sorted.slice(trim, sorted.length - trim);
  if (kept.length === 0) return NUM_ERROR;
  return meanOf(kept);
});

register('DEVSQ', (args) => {
  const f = flattenNumbers(args);
  if (f.error) return f.error;
  if (f.values.length === 0) return 0;
  const m = meanOf(f.values);
  return f.values.reduce((a, b) => a + (b - m) * (b - m), 0);
});

register('AVEDEV', (args) => {
  const f = flattenNumbers(args);
  if (f.error) return f.error;
  if (f.values.length === 0) return NUM_ERROR;
  const m = meanOf(f.values);
  return f.values.reduce((a, b) => a + Math.abs(b - m), 0) / f.values.length;
});

register('MODE.MULT', (args) => {
  const f = flattenNumbers(args);
  if (f.error) return f.error;
  if (f.values.length === 0) return NUM_ERROR;
  const counts = new Map<number, number>();
  for (const v of f.values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let max = 1;
  for (const c of counts.values()) if (c > max) max = c;
  if (max < 2) return NUM_ERROR;
  const order: number[] = [];
  const seen = new Set<number>();
  for (const v of f.values) {
    if (counts.get(v) === max && !seen.has(v)) {
      order.push(v);
      seen.add(v);
    }
  }
  return order.map((v) => [v]);
});

// ----- PROB / FREQUENCY ------------------------------------------------------

register('PROB', (args) => {
  const xs = flattenNumbers([args[0]]);
  if (xs.error) return xs.error;
  const ps = flattenNumbers([args[1]]);
  if (ps.error) return ps.error;
  if (xs.values.length !== ps.values.length) return NUM_ERROR;
  const lower = toNumber(args[2]);
  if (isFormulaError(lower)) return lower;
  const upper = args[3] === undefined ? lower : toNumber(args[3]);
  if (isFormulaError(upper)) return upper;
  const lo = Math.min(lower, upper);
  const hi = Math.max(lower, upper);
  // Validate probabilities sum to 1.
  const total = ps.values.reduce((a, b) => a + b, 0);
  if (Math.abs(total - 1) > 1e-6) return NUM_ERROR;
  let p = 0;
  for (let i = 0; i < xs.values.length; i++) {
    if (xs.values[i]! >= lo && xs.values[i]! <= hi) p += ps.values[i]!;
  }
  return p;
});

register('FREQUENCY', (args) => {
  const data = flattenNumbers([args[0]]);
  if (data.error) return data.error;
  const bins = flattenNumbers([args[1]]);
  if (bins.error) return bins.error;
  const buckets = new Array<number>(bins.values.length + 1).fill(0);
  for (const v of data.values) {
    let placed = false;
    for (let i = 0; i < bins.values.length; i++) {
      if (v <= bins.values[i]!) {
        buckets[i]!++;
        placed = true;
        break;
      }
    }
    if (!placed) buckets[buckets.length - 1]!++;
  }
  return buckets.map((c) => [c]);
});

// ----- Confidence intervals --------------------------------------------------

register('CONFIDENCE.NORM', (args) => {
  const alpha = toNumber(args[0]);
  if (isFormulaError(alpha)) return alpha;
  const sigma = toNumber(args[1]);
  if (isFormulaError(sigma)) return sigma;
  const n = toNumber(args[2]);
  if (isFormulaError(n)) return n;
  if (alpha <= 0 || alpha >= 1 || sigma <= 0 || n < 1) return NUM_ERROR;
  const z = callRegistered('NORM.S.INV', [1 - alpha / 2]);
  if (isFormulaError(z)) return z;
  return (z as number) * (sigma / Math.sqrt(Math.trunc(n)));
});

register('CONFIDENCE.T', (args) => {
  const alpha = toNumber(args[0]);
  if (isFormulaError(alpha)) return alpha;
  const sigma = toNumber(args[1]);
  if (isFormulaError(sigma)) return sigma;
  const n = toNumber(args[2]);
  if (isFormulaError(n)) return n;
  if (alpha <= 0 || alpha >= 1 || sigma <= 0 || n < 2) return NUM_ERROR;
  const df = Math.trunc(n) - 1;
  const t = callRegistered('T.INV.2T', [alpha, df]);
  if (isFormulaError(t)) return t;
  return (t as number) * (sigma / Math.sqrt(Math.trunc(n)));
});

// ----- Hypothesis tests ------------------------------------------------------

register('Z.TEST', (args) => {
  const f = flattenNumbers([args[0]]);
  if (f.error) return f.error;
  const x = toNumber(args[1]);
  if (isFormulaError(x)) return x;
  if (f.values.length < 2) return NA_ERROR_FALLBACK();
  const mean = meanOf(f.values);
  const sigmaArg = args[2];
  const sigma =
    sigmaArg === undefined || sigmaArg === '' ? Math.sqrt(variance(f.values, true)) : toNumber(sigmaArg);
  if (isFormulaError(sigma)) return sigma;
  if (sigma <= 0) return NUM_ERROR;
  const z = (mean - x) / (sigma / Math.sqrt(f.values.length));
  const cdf = callRegistered('NORM.S.DIST', [z, true]);
  if (isFormulaError(cdf)) return cdf;
  return 1 - (cdf as number);
});

function NA_ERROR_FALLBACK(): FormulaError {
  return NUM_ERROR;
}

register('T.TEST', (args) => {
  const a = flattenNumbers([args[0]]);
  if (a.error) return a.error;
  const b = flattenNumbers([args[1]]);
  if (b.error) return b.error;
  const tails = toNumber(args[2]);
  if (isFormulaError(tails)) return tails;
  const type = toNumber(args[3]);
  if (isFormulaError(type)) return type;
  if (a.values.length < 2 || b.values.length < 2) return NUM_ERROR;
  const ma = meanOf(a.values);
  const mb = meanOf(b.values);
  let t = 0;
  let df = 0;
  if (type === 1) {
    // Paired
    if (a.values.length !== b.values.length) return NA_ERROR_FALLBACK();
    const diffs = a.values.map((v, i) => v - b.values[i]!);
    const md = meanOf(diffs);
    const sd = Math.sqrt(variance(diffs, true));
    t = md / (sd / Math.sqrt(diffs.length));
    df = diffs.length - 1;
  } else if (type === 2) {
    // Two-sample, equal variance
    const va = variance(a.values, true);
    const vb = variance(b.values, true);
    const na = a.values.length;
    const nb = b.values.length;
    const sp = ((na - 1) * va + (nb - 1) * vb) / (na + nb - 2);
    t = (ma - mb) / Math.sqrt(sp * (1 / na + 1 / nb));
    df = na + nb - 2;
  } else {
    // type 3 — Welch
    const va = variance(a.values, true);
    const vb = variance(b.values, true);
    const na = a.values.length;
    const nb = b.values.length;
    t = (ma - mb) / Math.sqrt(va / na + vb / nb);
    df = Math.pow(va / na + vb / nb, 2) /
      (Math.pow(va / na, 2) / (na - 1) + Math.pow(vb / nb, 2) / (nb - 1));
  }
  const useTwoTail = Math.trunc(tails) === 2;
  if (useTwoTail) {
    return callRegistered('T.DIST.2T', [Math.abs(t), df]);
  }
  return callRegistered('T.DIST.RT', [Math.abs(t), df]);
});

register('F.TEST', (args) => {
  const a = flattenNumbers([args[0]]);
  if (a.error) return a.error;
  const b = flattenNumbers([args[1]]);
  if (b.error) return b.error;
  if (a.values.length < 2 || b.values.length < 2) return DIV_ZERO;
  const va = variance(a.values, true);
  const vb = variance(b.values, true);
  if (va === 0 || vb === 0) return DIV_ZERO;
  // Excel returns the two-tailed p-value.
  const F = va > vb ? va / vb : vb / va;
  const df1 = (va > vb ? a.values.length : b.values.length) - 1;
  const df2 = (va > vb ? b.values.length : a.values.length) - 1;
  const right = callRegistered('F.DIST.RT', [F, df1, df2]);
  if (isFormulaError(right)) return right;
  return 2 * (right as number);
});

register('CHISQ.TEST', (args) => {
  const obs = to2D(args[0]).map((r) => r.map((v) => Number(v) || 0));
  const exp = to2D(args[1]).map((r) => r.map((v) => Number(v) || 0));
  if (obs.length === 0 || obs.length !== exp.length || obs[0]!.length !== exp[0]!.length) {
    return NUM_ERROR;
  }
  let chi = 0;
  for (let i = 0; i < obs.length; i++) {
    for (let j = 0; j < obs[i]!.length; j++) {
      const e = exp[i]![j]!;
      if (e === 0) return DIV_ZERO;
      const d = obs[i]![j]! - e;
      chi += (d * d) / e;
    }
  }
  const rows = obs.length;
  const cols = obs[0]!.length;
  const df = rows > 1 && cols > 1 ? (rows - 1) * (cols - 1) : Math.max(rows, cols) - 1;
  return callRegistered('CHISQ.DIST.RT', [chi, df]);
});

// ----- Regression ------------------------------------------------------------

function linearRegress(
  ys: number[],
  xs: number[],
  withIntercept: boolean,
): { m: number; b: number } {
  const n = ys.length;
  if (withIntercept) {
    const mx = meanOf(xs);
    const my = meanOf(ys);
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i]! - mx) * (ys[i]! - my);
      den += (xs[i]! - mx) ** 2;
    }
    const m = den === 0 ? 0 : num / den;
    return { m, b: my - m * mx };
  }
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += xs[i]! * ys[i]!;
    den += xs[i]! ** 2;
  }
  return { m: den === 0 ? 0 : num / den, b: 0 };
}

function defaultXs(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i + 1);
}

// LINEST(known_ys, [known_xs], [const], [stats])
register('LINEST', (args) => {
  const ys = flattenNumbers([args[0]]);
  if (ys.error) return ys.error;
  if (ys.values.length < 2) return NUM_ERROR;
  const xsRaw = args[1];
  const xs =
    xsRaw === undefined || xsRaw === '' || xsRaw === null
      ? defaultXs(ys.values.length)
      : flattenNumbers([xsRaw]).values;
  if (xs.length !== ys.values.length) return NUM_ERROR;
  const withConst = args[2] === undefined || args[2] === '' ? true : Boolean(args[2]);
  const { m, b } = linearRegress(ys.values, xs, withConst);
  return [[m, b]];
});

// LOGEST: y = b * m^x → fit log(y) = log(b) + x*log(m) by linear regression.
register('LOGEST', (args) => {
  const ys = flattenNumbers([args[0]]);
  if (ys.error) return ys.error;
  if (ys.values.length < 2) return NUM_ERROR;
  const logYs: number[] = [];
  for (const v of ys.values) {
    if (v <= 0) return NUM_ERROR;
    logYs.push(Math.log(v));
  }
  const xsRaw = args[1];
  const xs =
    xsRaw === undefined || xsRaw === '' || xsRaw === null
      ? defaultXs(ys.values.length)
      : flattenNumbers([xsRaw]).values;
  if (xs.length !== ys.values.length) return NUM_ERROR;
  const withConst = args[2] === undefined || args[2] === '' ? true : Boolean(args[2]);
  const { m, b } = linearRegress(logYs, xs, withConst);
  return [[Math.exp(m), Math.exp(b)]];
});

// GROWTH(known_ys, [known_xs], [new_xs], [const])
register('GROWTH', (args) => {
  const ys = flattenNumbers([args[0]]);
  if (ys.error) return ys.error;
  if (ys.values.length < 2) return NUM_ERROR;
  for (const v of ys.values) if (v <= 0) return NUM_ERROR;
  const logYs = ys.values.map((v) => Math.log(v));
  const xsRaw = args[1];
  const xs =
    xsRaw === undefined || xsRaw === '' || xsRaw === null
      ? defaultXs(ys.values.length)
      : flattenNumbers([xsRaw]).values;
  if (xs.length !== ys.values.length) return NUM_ERROR;
  const newXsRaw = args[2];
  const newXs =
    newXsRaw === undefined || newXsRaw === '' || newXsRaw === null
      ? xs
      : flattenNumbers([newXsRaw]).values;
  const withConst = args[3] === undefined || args[3] === '' ? true : Boolean(args[3]);
  const { m, b } = linearRegress(logYs, xs, withConst);
  return newXs.map((x) => [Math.exp(b + m * x)]);
});

