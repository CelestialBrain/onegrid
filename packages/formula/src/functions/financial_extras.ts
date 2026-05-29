// =============================================================================
// Financial additions (v1.1.0 wave 12).
//
// Cumulative payment series, effective/nominal rate conversion, straight-line
// interest, equivalent compound rate, dollar-fraction conversion, treasury-bill
// formulas, and simple discounted-security yield/price. The odd-period and
// French-tax depreciation functions (ODDFPRICE/ODDFYIELD/ODDLPRICE/ODDLYIELD,
// AMORDEGRC/AMORLINC) and precise coupon day-count helpers (COUPDAYS,
// COUPDAYBS, COUPDAYSNC) are registered as #NAME! deferrals — same pattern
// as OFFSET/INDIRECT — because they require day-count-convention plumbing
// (Actual/360, Actual/Actual, 30/360 European, etc.) that this engine does
// not yet expose.
// =============================================================================

import { toNumber } from '../coerce';
import { type FormulaError, NAME_ERROR, NUM_ERROR, isFormulaError } from '../errors';
import { getFunction, register, toDate, daysBetween } from './_shared';

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

// ----- Deferrals — need day-count-convention infrastructure -----------------

for (const name of [
  'COUPDAYS',
  'COUPDAYBS',
  'COUPDAYSNC',
  'AMORDEGRC',
  'AMORLINC',
  'ODDFPRICE',
  'ODDFYIELD',
  'ODDLPRICE',
  'ODDLYIELD',
]) {
  register(name, () => NAME_ERROR);
}

