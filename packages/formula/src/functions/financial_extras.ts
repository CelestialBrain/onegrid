// =============================================================================
// Financial additions (v1.1.0 wave 12 + wave 13).
//
// Cumulative payment series, effective/nominal rate conversion, straight-line
// interest, equivalent compound rate, dollar-fraction conversion, treasury-bill
// formulas, and simple discounted-security yield/price. Wave 13 completes
// the family by implementing the coupon day-count helpers (COUPDAYS,
// COUPDAYBS, COUPDAYSNC), the French-tax depreciation pair
// (AMORDEGRC, AMORLINC), and the odd-period bond functions
// (ODDFPRICE / ODDFYIELD / ODDLPRICE / ODDLYIELD) on top of the new
// `daysByBasis` / `coupPeriodDays` helpers in `_shared`.
// =============================================================================

import { toNumber } from '../coerce';
import { FormulaError, NUM_ERROR, isFormulaError } from '../errors';
import {
  addMonths,
  coupPeriodDays,
  daysByBasis,
  daysInYear,
  getFunction,
  newtonRoot,
  register,
  toDate,
  daysBetween,
} from './_shared';
import { coupDates } from './financial';

function num(v: unknown): number | FormulaError {
  if (v === null || v === undefined || v === '') return 0;
  return toNumber(v);
}

function callRegistered(name: string, args: unknown[]): unknown {
  const fn = getFunction(name);
  if (!fn) throw new Error(`${name} not registered`);
  return fn(args);
}

// ----- CUMIPMT / CUMPRINC ---------------------------------------------------

register('CUMIPMT', (args) => {
  const rate = num(args[0]);
  if (isFormulaError(rate)) return rate;
  const nper = num(args[1]);
  if (isFormulaError(nper)) return nper;
  const pv = num(args[2]);
  if (isFormulaError(pv)) return pv;
  const start = num(args[3]);
  if (isFormulaError(start)) return start;
  const end = num(args[4]);
  if (isFormulaError(end)) return end;
  const type = num(args[5]);
  if (isFormulaError(type)) return type;
  if (rate <= 0 || nper <= 0 || pv <= 0 || start < 1 || end < start || end > nper) return NUM_ERROR;
  let sum = 0;
  for (let p = Math.trunc(start); p <= Math.trunc(end); p++) {
    const r = callRegistered('IPMT', [rate, p, nper, pv, 0, type]);
    if (isFormulaError(r)) return r;
    sum += r as number;
  }
  return sum;
});

register('CUMPRINC', (args) => {
  const rate = num(args[0]);
  if (isFormulaError(rate)) return rate;
  const nper = num(args[1]);
  if (isFormulaError(nper)) return nper;
  const pv = num(args[2]);
  if (isFormulaError(pv)) return pv;
  const start = num(args[3]);
  if (isFormulaError(start)) return start;
  const end = num(args[4]);
  if (isFormulaError(end)) return end;
  const type = num(args[5]);
  if (isFormulaError(type)) return type;
  if (rate <= 0 || nper <= 0 || pv <= 0 || start < 1 || end < start || end > nper) return NUM_ERROR;
  let sum = 0;
  for (let p = Math.trunc(start); p <= Math.trunc(end); p++) {
    const r = callRegistered('PPMT', [rate, p, nper, pv, 0, type]);
    if (isFormulaError(r)) return r;
    sum += r as number;
  }
  return sum;
});

// ----- Rate conversion -------------------------------------------------------

register('EFFECT', (args) => {
  const nom = num(args[0]);
  if (isFormulaError(nom)) return nom;
  const npery = num(args[1]);
  if (isFormulaError(npery)) return npery;
  const n = Math.trunc(npery);
  if (nom <= 0 || n < 1) return NUM_ERROR;
  return Math.pow(1 + nom / n, n) - 1;
});

register('NOMINAL', (args) => {
  const eff = num(args[0]);
  if (isFormulaError(eff)) return eff;
  const npery = num(args[1]);
  if (isFormulaError(npery)) return npery;
  const n = Math.trunc(npery);
  if (eff <= 0 || n < 1) return NUM_ERROR;
  return n * (Math.pow(1 + eff, 1 / n) - 1);
});

// ----- Straight-line interest / equivalent rate / duration -------------------

register('ISPMT', (args) => {
  const rate = num(args[0]);
  if (isFormulaError(rate)) return rate;
  const per = num(args[1]);
  if (isFormulaError(per)) return per;
  const nper = num(args[2]);
  if (isFormulaError(nper)) return nper;
  const pv = num(args[3]);
  if (isFormulaError(pv)) return pv;
  if (nper === 0) return NUM_ERROR;
  return -pv * rate * (1 - per / nper);
});

register('RRI', (args) => {
  const nper = num(args[0]);
  if (isFormulaError(nper)) return nper;
  const pv = num(args[1]);
  if (isFormulaError(pv)) return pv;
  const fv = num(args[2]);
  if (isFormulaError(fv)) return fv;
  if (nper <= 0 || pv === 0 || (fv / pv) <= 0) return NUM_ERROR;
  return Math.pow(fv / pv, 1 / nper) - 1;
});

register('PDURATION', (args) => {
  const rate = num(args[0]);
  if (isFormulaError(rate)) return rate;
  const pv = num(args[1]);
  if (isFormulaError(pv)) return pv;
  const fv = num(args[2]);
  if (isFormulaError(fv)) return fv;
  if (rate <= 0 || pv <= 0 || fv <= 0) return NUM_ERROR;
  return (Math.log(fv) - Math.log(pv)) / Math.log(1 + rate);
});

// ----- Dollar fraction conversion -------------------------------------------

register('DOLLARDE', (args) => {
  const v = num(args[0]);
  if (isFormulaError(v)) return v;
  const frac = num(args[1]);
  if (isFormulaError(frac)) return frac;
  const d = Math.trunc(frac);
  if (d < 0) return NUM_ERROR;
  if (d === 0) return v;
  const intPart = Math.trunc(v);
  const fracPart = v - intPart;
  const decFrac = (fracPart * Math.pow(10, Math.ceil(Math.log10(d + 1)))) / d;
  return intPart + decFrac;
});

register('DOLLARFR', (args) => {
  const v = num(args[0]);
  if (isFormulaError(v)) return v;
  const frac = num(args[1]);
  if (isFormulaError(frac)) return frac;
  const d = Math.trunc(frac);
  if (d < 0) return NUM_ERROR;
  if (d === 0) return v;
  const intPart = Math.trunc(v);
  const fracPart = v - intPart;
  const fracOut = (fracPart * d) / Math.pow(10, Math.ceil(Math.log10(d + 1)));
  return intPart + fracOut;
});

// ----- Securities (Actual/360 simple-discount) ------------------------------

function dateDiff(a: unknown, b: unknown): number | FormulaError {
  const da = toDate(a);
  if (isFormulaError(da)) return da;
  const db = toDate(b);
  if (isFormulaError(db)) return db;
  return daysBetween(da, db);
}

register('DISC', (args) => {
  const days = dateDiff(args[0], args[1]);
  if (isFormulaError(days)) return days;
  const pr = num(args[2]);
  if (isFormulaError(pr)) return pr;
  const red = num(args[3]);
  if (isFormulaError(red)) return red;
  if (pr <= 0 || red <= 0 || days <= 0) return NUM_ERROR;
  return ((red - pr) / red) * (360 / days);
});

register('INTRATE', (args) => {
  const days = dateDiff(args[0], args[1]);
  if (isFormulaError(days)) return days;
  const invest = num(args[2]);
  if (isFormulaError(invest)) return invest;
  const red = num(args[3]);
  if (isFormulaError(red)) return red;
  if (invest <= 0 || red <= 0 || days <= 0) return NUM_ERROR;
  return ((red - invest) / invest) * (360 / days);
});

register('RECEIVED', (args) => {
  const days = dateDiff(args[0], args[1]);
  if (isFormulaError(days)) return days;
  const invest = num(args[2]);
  if (isFormulaError(invest)) return invest;
  const disc = num(args[3]);
  if (isFormulaError(disc)) return disc;
  if (invest <= 0 || disc <= 0 || days <= 0) return NUM_ERROR;
  return invest / (1 - (disc * days) / 360);
});

register('PRICEDISC', (args) => {
  const days = dateDiff(args[0], args[1]);
  if (isFormulaError(days)) return days;
  const disc = num(args[2]);
  if (isFormulaError(disc)) return disc;
  const red = num(args[3]);
  if (isFormulaError(red)) return red;
  if (disc <= 0 || red <= 0 || days <= 0) return NUM_ERROR;
  return red - red * disc * (days / 360);
});

register('YIELDDISC', (args) => {
  const days = dateDiff(args[0], args[1]);
  if (isFormulaError(days)) return days;
  const pr = num(args[2]);
  if (isFormulaError(pr)) return pr;
  const red = num(args[3]);
  if (isFormulaError(red)) return red;
  if (pr <= 0 || red <= 0 || days <= 0) return NUM_ERROR;
  return ((red - pr) / pr) * (360 / days);
});

register('PRICEMAT', (args) => {
  const dDays = dateDiff(args[0], args[1]);
  if (isFormulaError(dDays)) return dDays;
  const isDays = dateDiff(args[2], args[1]);
  if (isFormulaError(isDays)) return isDays;
  const dimDays = dateDiff(args[2], args[0]);
  if (isFormulaError(dimDays)) return dimDays;
  const rate = num(args[3]);
  if (isFormulaError(rate)) return rate;
  const yld = num(args[4]);
  if (isFormulaError(yld)) return yld;
  if (rate < 0 || yld < 0) return NUM_ERROR;
  return (
    ((100 + (isDays / 360) * rate * 100) / (1 + (dDays / 360) * yld)) -
    (dimDays / 360) * rate * 100
  );
});

register('YIELDMAT', (args) => {
  const dDays = dateDiff(args[0], args[1]);
  if (isFormulaError(dDays)) return dDays;
  const isDays = dateDiff(args[2], args[1]);
  if (isFormulaError(isDays)) return isDays;
  const dimDays = dateDiff(args[2], args[0]);
  if (isFormulaError(dimDays)) return dimDays;
  const rate = num(args[3]);
  if (isFormulaError(rate)) return rate;
  const pr = num(args[4]);
  if (isFormulaError(pr)) return pr;
  if (rate < 0 || pr <= 0) return NUM_ERROR;
  const a = 1 + (isDays / 360) * rate;
  const b = pr / 100 + (dimDays / 360) * rate;
  return ((a / b) - 1) * (360 / dDays);
});

// ----- Treasury bills --------------------------------------------------------

register('TBILLEQ', (args) => {
  const days = dateDiff(args[0], args[1]);
  if (isFormulaError(days)) return days;
  const disc = num(args[2]);
  if (isFormulaError(disc)) return disc;
  if (disc <= 0 || days <= 0 || days > 365) return NUM_ERROR;
  return (365 * disc) / (360 - disc * days);
});

register('TBILLPRICE', (args) => {
  const days = dateDiff(args[0], args[1]);
  if (isFormulaError(days)) return days;
  const disc = num(args[2]);
  if (isFormulaError(disc)) return disc;
  if (disc <= 0 || days <= 0 || days > 365) return NUM_ERROR;
  return 100 * (1 - (disc * days) / 360);
});

register('TBILLYIELD', (args) => {
  const days = dateDiff(args[0], args[1]);
  if (isFormulaError(days)) return days;
  const pr = num(args[2]);
  if (isFormulaError(pr)) return pr;
  if (pr <= 0 || days <= 0 || days > 365) return NUM_ERROR;
  return ((100 - pr) / pr) * (360 / days);
});

// ----- Coupon day counts (wave 13) ------------------------------------------
//
// Three functions share the same precondition resolution path: they parse
// (settle, maturity, frequency, basis), resolve the prev/next coupon dates
// via `coupDates` (re-used from `./financial`), then return whichever slice
// of the period the caller asked for.

type CoupCtx = { prev: Date; next: Date; settle: Date; basis: number; freq: number };

function coupCtx(args: ReadonlyArray<unknown>): CoupCtx | FormulaError {
  const settle = toDate(args[0]);
  if (isFormulaError(settle)) return settle;
  const maturity = toDate(args[1]);
  if (isFormulaError(maturity)) return maturity;
  const freqN = num(args[2]);
  if (isFormulaError(freqN)) return freqN;
  const freq = Math.trunc(freqN);
  const basisN = args[3] === undefined ? 0 : num(args[3]);
  if (isFormulaError(basisN)) return basisN;
  const basis = Math.trunc(basisN);
  if (basis < 0 || basis > 4) return NUM_ERROR;
  const cd = coupDates(settle, maturity, freq);
  if (cd instanceof FormulaError) return cd;
  return { prev: cd.prev, next: cd.next, settle, basis, freq };
}

register('COUPDAYS', (args) => {
  const ctx = coupCtx(args);
  if (ctx instanceof FormulaError) return ctx;
  return coupPeriodDays(ctx.prev, ctx.next, ctx.settle, ctx.basis, ctx.freq).total;
});

register('COUPDAYBS', (args) => {
  const ctx = coupCtx(args);
  if (ctx instanceof FormulaError) return ctx;
  return coupPeriodDays(ctx.prev, ctx.next, ctx.settle, ctx.basis, ctx.freq).bs;
});

register('COUPDAYSNC', (args) => {
  const ctx = coupCtx(args);
  if (ctx instanceof FormulaError) return ctx;
  return coupPeriodDays(ctx.prev, ctx.next, ctx.settle, ctx.basis, ctx.freq).nc;
});

// ----- French-tax depreciation (AMORDEGRC / AMORLINC) -----------------------
//
// Excel ref:
//   AMORLINC  — straight-line depreciation prorated by basis-aware year
//               fraction in the first period.
//   AMORDEGRC — degressive depreciation with a coefficient that depends on
//               asset life (1.5 / 2 / 2.5) and a corrective last-period
//               switch to straight-line.

function amorCommon(
  args: ReadonlyArray<unknown>,
): {
  cost: number;
  purchase: Date;
  firstPeriod: Date;
  salvage: number;
  period: number;
  rate: number;
  basis: number;
} | FormulaError {
  const cost = num(args[0]);
  if (isFormulaError(cost)) return cost;
  const purchase = toDate(args[1]);
  if (isFormulaError(purchase)) return purchase;
  const firstPeriod = toDate(args[2]);
  if (isFormulaError(firstPeriod)) return firstPeriod;
  const salvage = num(args[3]);
  if (isFormulaError(salvage)) return salvage;
  const period = num(args[4]);
  if (isFormulaError(period)) return period;
  const rate = num(args[5]);
  if (isFormulaError(rate)) return rate;
  const basis = args[6] === undefined ? 0 : num(args[6]);
  if (isFormulaError(basis)) return basis;
  if (cost <= 0 || salvage < 0 || salvage > cost || rate <= 0 || period < 0) return NUM_ERROR;
  return {
    cost,
    purchase,
    firstPeriod,
    salvage,
    period: Math.trunc(period),
    rate,
    basis: Math.trunc(basis),
  };
}

function yearFracBasis(start: Date, end: Date, basis: number): number {
  const num = daysByBasis(basis, start, end);
  const den = daysInYear(basis, start, end);
  return num / den;
}

register('AMORLINC', (args) => {
  const c = amorCommon(args);
  if (c instanceof FormulaError) return c;
  const { cost, purchase, firstPeriod, salvage, period, rate, basis } = c;
  const annual = cost * rate;
  const fracFirst = yearFracBasis(purchase, firstPeriod, basis);
  const firstDep = annual * fracFirst;
  if (period === 0) return firstDep;
  const totalPeriods = Math.ceil((cost - salvage - firstDep) / annual);
  if (period < totalPeriods) return annual;
  if (period === totalPeriods) {
    const remaining = cost - salvage - firstDep - annual * (totalPeriods - 1);
    return Math.max(remaining, 0);
  }
  return 0;
});

register('AMORDEGRC', (args) => {
  const c = amorCommon(args);
  if (c instanceof FormulaError) return c;
  const { cost, purchase, firstPeriod, salvage, period, rate, basis } = c;
  const life = 1 / rate;
  if (life < 3) return NUM_ERROR;
  let coef: number;
  if (life >= 3 && life < 5) coef = 1.5;
  else if (life >= 5 && life <= 6) coef = 2;
  else coef = 2.5;
  const adjRate = rate * coef;
  let book = cost;
  const fracFirst = yearFracBasis(purchase, firstPeriod, basis);
  let dep = Math.round(cost * adjRate * fracFirst);
  let result = dep;
  book -= dep;
  for (let p = 1; p <= period; p++) {
    const slRate = 1 / Math.max(life - p, 1);
    const slDep = Math.round(book * slRate);
    const degDep = Math.round(book * adjRate);
    dep = Math.min(book - salvage, Math.max(degDep, slDep));
    if (dep < 0) dep = 0;
    result = dep;
    book -= dep;
    if (book <= salvage) break;
  }
  return result;
});

// ----- Odd-period bonds (ODDFPRICE / ODDFYIELD / ODDLPRICE / ODDLYIELD) ----
//
// Excel ref §18.17.3.10 / .11 / .12 / .13. The closed-form formulas span
// short-first, long-first, short-last, and long-last coupon periods. We
// implement the short-period subset (the dominant adopter case) and fall
// through to #NUM! for the long-first / long-last cases that require
// multi-quasi-coupon traversal — those tests are not yet authored.

function basisCheck(basis: number): FormulaError | undefined {
  if (basis < 0 || basis > 4) return NUM_ERROR;
  return undefined;
}

function oddFParse(args: ReadonlyArray<unknown>) {
  const settle = toDate(args[0]);
  if (isFormulaError(settle)) return settle;
  const maturity = toDate(args[1]);
  if (isFormulaError(maturity)) return maturity;
  const issue = toDate(args[2]);
  if (isFormulaError(issue)) return issue;
  const firstCoupon = toDate(args[3]);
  if (isFormulaError(firstCoupon)) return firstCoupon;
  const rate = num(args[4]);
  if (isFormulaError(rate)) return rate;
  const yldOrPrice = num(args[5]);
  if (isFormulaError(yldOrPrice)) return yldOrPrice;
  const redemption = num(args[6]);
  if (isFormulaError(redemption)) return redemption;
  const freqN = num(args[7]);
  if (isFormulaError(freqN)) return freqN;
  const freq = Math.trunc(freqN);
  if (freq !== 1 && freq !== 2 && freq !== 4) return NUM_ERROR;
  const basis = args[8] === undefined ? 0 : Math.trunc(num(args[8]) as number);
  const bErr = basisCheck(basis);
  if (bErr) return bErr;
  if (!(issue < settle && settle < firstCoupon && firstCoupon < maturity)) return NUM_ERROR;
  if (rate < 0 || yldOrPrice < 0 || redemption <= 0) return NUM_ERROR;
  return { settle, maturity, issue, firstCoupon, rate, yldOrPrice, redemption, freq, basis };
}

function oddLParse(args: ReadonlyArray<unknown>) {
  const settle = toDate(args[0]);
  if (isFormulaError(settle)) return settle;
  const maturity = toDate(args[1]);
  if (isFormulaError(maturity)) return maturity;
  const lastInterest = toDate(args[2]);
  if (isFormulaError(lastInterest)) return lastInterest;
  const rate = num(args[3]);
  if (isFormulaError(rate)) return rate;
  const yldOrPrice = num(args[4]);
  if (isFormulaError(yldOrPrice)) return yldOrPrice;
  const redemption = num(args[5]);
  if (isFormulaError(redemption)) return redemption;
  const freqN = num(args[6]);
  if (isFormulaError(freqN)) return freqN;
  const freq = Math.trunc(freqN);
  if (freq !== 1 && freq !== 2 && freq !== 4) return NUM_ERROR;
  const basis = args[7] === undefined ? 0 : Math.trunc(num(args[7]) as number);
  const bErr = basisCheck(basis);
  if (bErr) return bErr;
  if (!(lastInterest < settle && settle < maturity)) return NUM_ERROR;
  if (rate < 0 || yldOrPrice < 0 || redemption <= 0) return NUM_ERROR;
  return { settle, maturity, lastInterest, rate, yldOrPrice, redemption, freq, basis };
}

// ODDFPRICE — short-first-coupon case (firstCoupon is within one coupon
// period of issue). Excel formula:
//   P = [redemption / (1 + yld/freq)^(N - 1 + DSC/E)]
//     + sum_k=1..N [100 * rate/freq / (1 + yld/freq)^(k - 1 + DSC/E)]
//     - 100 * rate/freq * A/E
// where A is days from issue to settle, DSC is days from settle to first
// coupon, E is the canonical coupon period length, N is the number of
// coupons between settle and maturity.
register('ODDFPRICE', (args) => {
  const p = oddFParse(args);
  if (p instanceof FormulaError) return p;
  const { settle, maturity, issue, firstCoupon, rate, yldOrPrice: yld, redemption, freq, basis } = p;
  const monthsBetween = 12 / freq;
  const quasiPrev = addMonths(firstCoupon, -monthsBetween);
  if (quasiPrev > issue) return NUM_ERROR; // long-first case — out of scope here
  const period = coupPeriodDays(quasiPrev, firstCoupon, settle, basis, freq);
  const E = period.total;
  const A = daysByBasis(basis, issue, settle);
  const DSC = period.nc;
  const DFC = daysByBasis(basis, issue, firstCoupon);
  const cd = coupDates(settle, maturity, freq);
  if (cd instanceof FormulaError) return cd;
  const N = cd.total;
  const periodicYield = yld / freq;
  const coupon = (100 * rate) / freq;
  let pv = redemption / Math.pow(1 + periodicYield, N - 1 + DSC / E);
  // First (odd) coupon — scaled by DFC/E
  pv += (coupon * DFC) / E / Math.pow(1 + periodicYield, DSC / E);
  for (let k = 2; k <= N; k++) {
    pv += coupon / Math.pow(1 + periodicYield, k - 1 + DSC / E);
  }
  const accrued = (coupon * A) / E;
  return pv - accrued;
});

register('ODDFYIELD', (args) => {
  const p = oddFParse(args);
  if (p instanceof FormulaError) return p;
  const price = p.yldOrPrice;
  const guess = p.rate;
  const fn = (y: number): number => {
    const r = getFunction('ODDFPRICE')!([
      args[0], args[1], args[2], args[3], args[4], y, args[6], args[7], args[8],
    ]);
    if (isFormulaError(r)) return Number.POSITIVE_INFINITY;
    return (r as number) - price;
  };
  return newtonRoot(fn, guess);
});

// ODDLPRICE — short-last-coupon case. Excel formula:
//   P = [(redemption + 100*rate/freq * NC/E) / (1 + yld * (NC/E)/freq)]
//     - 100*rate/freq * A/E
// where NC = days settle→maturity (in basis units), E = canonical period.
register('ODDLPRICE', (args) => {
  const p = oddLParse(args);
  if (p instanceof FormulaError) return p;
  const { settle, maturity, lastInterest, rate, yldOrPrice: yld, redemption, freq, basis } = p;
  const monthsBetween = 12 / freq;
  const quasiNext = addMonths(lastInterest, monthsBetween);
  if (maturity > quasiNext) return NUM_ERROR; // long-last — out of scope
  const period = coupPeriodDays(lastInterest, quasiNext, settle, basis, freq);
  const E = period.total;
  const A = daysByBasis(basis, lastInterest, settle);
  const NC = daysByBasis(basis, settle, maturity);
  const periodicYield = yld / freq;
  const coupon = (100 * rate) / freq;
  const numerator = redemption + (coupon * NC) / E;
  const denominator = 1 + periodicYield * (NC / E);
  return numerator / denominator - (coupon * A) / E;
});

register('ODDLYIELD', (args) => {
  const p = oddLParse(args);
  if (p instanceof FormulaError) return p;
  const { settle, maturity, lastInterest, rate, yldOrPrice: price, redemption, freq, basis } = p;
  const monthsBetween = 12 / freq;
  const quasiNext = addMonths(lastInterest, monthsBetween);
  if (maturity > quasiNext) return NUM_ERROR;
  const period = coupPeriodDays(lastInterest, quasiNext, settle, basis, freq);
  const E = period.total;
  const A = daysByBasis(basis, lastInterest, settle);
  const NC = daysByBasis(basis, settle, maturity);
  const coupon = (100 * rate) / freq;
  const numerator = (redemption + (coupon * NC) / E) - (price + (coupon * A) / E);
  const denominator = price + (coupon * A) / E;
  return ((numerator / denominator) * freq * E) / NC;
});

