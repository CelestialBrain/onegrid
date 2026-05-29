// =============================================================================
// Statistics category (v1.1.0).
//
// Conditional aggregates (*IF / *IFS) use the shared `matchesCriterion`
// helper from _shared which honors Excel's wildcard (* / ?) and
// comparison-prefix (">=", "<>", etc.) syntax on criteria strings.
// =============================================================================

import { toNumber } from '../coerce';
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
