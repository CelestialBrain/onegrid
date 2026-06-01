// =============================================================================
// Financial category (v1.1.0 wave 5).
//
// Annuity formulas follow Excel's sign convention: money OUT of the borrower
// is positive, IN is negative. PMT(rate, nper, pv) on a loan returns NEGATIVE.
//
// IRR/XIRR/RATE/YIELD iterate via Newton's method (newtonRoot in _shared).
// =============================================================================

import { toBoolean, toNumber } from '../coerce';
import {
  DIV_ZERO,
  FormulaError,
  NUM_ERROR,
  VALUE_ERROR,
  isFormulaError,
} from '../errors';
import {
  MS_PER_DAY,
  addMonths,
  flatten,
  getFunction,
  newtonRoot,
  register,
  toDate,
} from './_shared';

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
  if (rate === 0) return 0;
  const balance = type === 1 && per === 1
    ? pv
    : -(pv * fvFactor(rate, per - 1) + pmt * ((fvFactor(rate, per - 1) - 1) / rate));
  const ipmt = balance * rate;
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
  const rate = toNumber(args[0]);
  if (isFormulaError(rate)) return rate;
  let total = 0;
  let i = 1;
  for (const v of flatten(args.slice(1))) {
    if (isFormulaError(v)) return v;
    const n = toNumber(v);
    if (isFormulaError(n)) continue;
    total += n / Math.pow(1 + rate, i);
    i++;
  }
  return total;
});

register('XNPV', (args) => {
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

register('IRR', (args) => {
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

// ----- Depreciation -----

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
  if (period === 1) return (cost * rate * month) / 12;
  let totalDep = (cost * rate * month) / 12;
  for (let p = 2; p < period; p++) totalDep += (cost - totalDep) * rate;
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

// ----- Bond / accrual -----

register('ACCRINTM', (args) => {
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

export function coupDates(
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

register('PRICE', (args) => {
  const settle = toDate(args[0]);
  const maturity = toDate(args[1]);
  if (!(settle instanceof Date)) return settle;
  if (!(maturity instanceof Date)) return maturity;
  const rate = toNumber(args[2]);
  const yld = toNumber(args[3]);
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
  const N = cd.total;
  const yfNextSettle = getFunction('YEARFRAC')!([settle, cd.next, basis]);
  if (isFormulaError(yfNextSettle)) return yfNextSettle;
  const A_ratio = (yfNextSettle as number) * freq;
  const periodicYield = yld / freq;
  const coupon = (rate * redemption) / freq;
  let pv = 0;
  for (let k = 1; k <= N; k++) {
    pv += coupon / Math.pow(1 + periodicYield, k - 1 + A_ratio);
  }
  pv += redemption / Math.pow(1 + periodicYield, N - 1 + A_ratio);
  const accrued = coupon * (1 - A_ratio);
  return pv - accrued;
});

register('YIELD', (args) => {
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
  const guess = rate;
  const fn = (y: number): number => {
    const p = getFunction('PRICE')!([settle, maturity, rate, y, redemption, freq, basis]);
    if (isFormulaError(p)) return Number.POSITIVE_INFINITY;
    return (p as number) - price;
  };
  return newtonRoot(fn, guess);
});

register('DURATION', (args) => {
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
