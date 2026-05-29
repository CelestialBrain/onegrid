// =============================================================================
// @onegrid/formula — v1.1.0 wave 5: financial family.
//
// Annuity formulas follow Excel's sign convention (money OUT = positive,
// IN = negative). Tolerances are loose where iteration is involved
// (IRR/XIRR/YIELD use Newton's method; precision depends on the residual
// tolerance set in the source — 1e-10).
// =============================================================================

import { describe, expect, it } from 'vitest';
import { getFunction } from '../functions';
import { DIV_ZERO, NUM_ERROR } from '../errors';

const call = (name: string, args: unknown[]): unknown => {
  const fn = getFunction(name);
  if (!fn) throw new Error(`function ${name} not registered`);
  return fn(args);
};

describe('@onegrid/formula — annuity: PMT / FV / PV / NPER / RATE', () => {
  it('PMT for a $10,000 5-year loan at 8%/yr', () => {
    // Excel: PMT(0.08/12, 60, 10000) ≈ -202.76
    const r = call('PMT', [0.08 / 12, 60, 10000]) as number;
    expect(r).toBeCloseTo(-202.76, 2);
  });

  it('PMT with rate=0 is plain division', () => {
    expect(call('PMT', [0, 10, 1000])).toBe(-100);
  });

  it('FV of $100/period for 10 periods at 5% (annuity-due type=0)', () => {
    // Excel: FV(0.05, 10, -100, 0, 0) ≈ 1257.79
    const r = call('FV', [0.05, 10, -100]) as number;
    expect(r).toBeCloseTo(1257.79, 2);
  });

  it('PV of $1000 received 5 years out at 7%', () => {
    // Excel: PV(0.07, 5, 0, 1000) ≈ -713.0
    const r = call('PV', [0.07, 5, 0, 1000]) as number;
    expect(r).toBeCloseTo(-712.99, 1);
  });

  it('NPER for paying off $10,000 at $200/mo with 6% APR', () => {
    // log(4/3) / log(1.005) ≈ 57.68 periods.
    const r = call('NPER', [0.06 / 12, -200, 10000]) as number;
    expect(r).toBeCloseTo(57.68, 1);
  });

  it('RATE recovers the input rate from PMT', () => {
    // PMT for (0.08/12, 60, 10000) was -202.76; feed it back.
    const r = call('RATE', [60, -202.76, 10000]) as number;
    expect(r).toBeCloseTo(0.08 / 12, 5);
  });

  it('IPMT + PPMT sum to PMT for any in-bounds period', () => {
    const rate = 0.08 / 12;
    const nper = 60;
    const pv = 10000;
    const pmt = call('PMT', [rate, nper, pv]) as number;
    const ipmt = call('IPMT', [rate, 1, nper, pv]) as number;
    const ppmt = call('PPMT', [rate, 1, nper, pv]) as number;
    expect(ipmt + ppmt).toBeCloseTo(pmt, 6);
  });

  it('IPMT in period 1 = -pv * rate (loan balance hasn\'t moved)', () => {
    const rate = 0.08 / 12;
    const ipmt = call('IPMT', [rate, 1, 60, 10000]) as number;
    expect(ipmt).toBeCloseTo(-10000 * rate, 6);
  });
});

describe('@onegrid/formula — NPV / XNPV / IRR / XIRR / MIRR', () => {
  it('NPV places first cashflow at period 1', () => {
    // NPV(0.1, 100, 100, 100) = 100/1.1 + 100/1.21 + 100/1.331 ≈ 248.69
    expect(call('NPV', [0.1, 100, 100, 100])).toBeCloseTo(248.69, 2);
  });

  it('XNPV uses 365-day year fractions from the first date', () => {
    const values = [-1000, 600, 600];
    const dates = [
      new Date(2026, 0, 1),
      new Date(2026, 6, 1),
      new Date(2027, 0, 1),
    ];
    // XNPV(0.1, ...) > 0 means project is value-positive at 10%.
    const r = call('XNPV', [0.1, values, dates]) as number;
    expect(r).toBeGreaterThan(0);
  });

  it('IRR recovers the discount rate that zeroes NPV', () => {
    // -1000 + 300/(1+r) + 400/(1+r)^2 + 500/(1+r)^3 = 0 → r ≈ 0.089
    const values = [-1000, 300, 400, 500];
    const irr = call('IRR', [values]) as number;
    expect(irr).toBeCloseTo(0.089, 2);
    // Verify it zeroes the equation.
    const npv = values.reduce((acc, v, i) => acc + v / Math.pow(1 + irr, i), 0);
    expect(Math.abs(npv)).toBeLessThan(1e-8);
  });

  it('XIRR equals IRR on evenly-spaced annual flows', () => {
    const values = [-1000, 300, 400, 500];
    const dates = [
      new Date(2026, 0, 1),
      new Date(2027, 0, 1),
      new Date(2028, 0, 1),
      new Date(2029, 0, 1),
    ];
    const xirr = call('XIRR', [values, dates]) as number;
    expect(xirr).toBeCloseTo(0.089, 2);
  });

  it('MIRR with different finance and reinvest rates', () => {
    // (1324.32 / 1000)^(1/3) - 1 ≈ 0.0983
    const values = [-1000, 300, 400, 500];
    const m = call('MIRR', [values, 0.1, 0.12]) as number;
    expect(m).toBeCloseTo(0.0983, 3);
  });

  it('MIRR with all-positive or all-negative → #DIV/0!', () => {
    expect(call('MIRR', [[100, 200, 300], 0.1, 0.1])).toBe(DIV_ZERO);
  });
});

describe('@onegrid/formula — depreciation: SLN / SYD / DB / DDB / VDB', () => {
  it('SLN is plain straight-line', () => {
    expect(call('SLN', [10000, 1000, 5])).toBe(1800);
  });

  it('SYD weights early periods higher', () => {
    // sum-of-years digits for life=5 is 15. Period-1 = 9000 * 5/15 = 3000.
    expect(call('SYD', [10000, 1000, 5, 1])).toBe(3000);
    expect(call('SYD', [10000, 1000, 5, 5])).toBe(600);
  });

  it('DDB factor=2 doubles SLN rate', () => {
    // DDB(cost=10000, salvage=1000, life=5, period=1, factor=2):
    //   rate=2/5=0.4 → period-1 = 4000.
    expect(call('DDB', [10000, 1000, 5, 1, 2])).toBe(4000);
  });

  it('VDB summed from 0 to life equals (cost − salvage)', () => {
    const total = call('VDB', [10000, 1000, 5, 0, 5]) as number;
    expect(total).toBeCloseTo(9000, 2);
  });
});

describe('@onegrid/formula — bond / accrual', () => {
  it('ACCRINTM computes interest from issue to settlement (closed-form)', () => {
    // 6% on $1000 for 1 year via 30/360 basis = 60.
    expect(
      call('ACCRINTM', [new Date(2025, 0, 1), new Date(2026, 0, 1), 0.06, 1000, 0]),
    ).toBeCloseTo(60, 2);
  });

  it('COUPNUM counts coupons between settle and maturity', () => {
    // Semi-annual (freq=2), 5 years out → 10 coupons.
    expect(call('COUPNUM', [new Date(2026, 0, 1), new Date(2031, 0, 1), 2])).toBe(10);
  });

  it('COUPNCD returns the next coupon date after settlement', () => {
    const next = call('COUPNCD', [new Date(2026, 2, 15), new Date(2031, 0, 1), 2]) as Date;
    // Next semi-annual coupon after 2026-03-15 with 2031-01-01 maturity = 2026-07-01.
    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth()).toBe(6); // July
    expect(next.getDate()).toBe(1);
  });

  it('PRICE of par bond when yield = coupon → ~100', () => {
    // settle Jan 1 2026, maturity Jan 1 2031, 5% coupon, 5% yield, redemption 100, semi-annual.
    const p = call('PRICE', [
      new Date(2026, 0, 1),
      new Date(2031, 0, 1),
      0.05,
      0.05,
      100,
      2,
      0,
    ]) as number;
    expect(p).toBeCloseTo(100, 0);
  });

  it('YIELD recovers the yield used to compute PRICE', () => {
    const settle = new Date(2026, 0, 1);
    const maturity = new Date(2031, 0, 1);
    const p = call('PRICE', [settle, maturity, 0.05, 0.04, 100, 2, 0]) as number;
    const y = call('YIELD', [settle, maturity, 0.05, p, 100, 2, 0]) as number;
    expect(y).toBeCloseTo(0.04, 3);
  });

  it('DURATION (Macaulay) on a par-bond is < bond term', () => {
    const d = call('DURATION', [
      new Date(2026, 0, 1),
      new Date(2031, 0, 1),
      0.05,
      0.05,
      2,
      0,
    ]) as number;
    expect(d).toBeGreaterThan(4);
    expect(d).toBeLessThan(5);
  });

  it('MDURATION < DURATION when yield > 0', () => {
    const settle = new Date(2026, 0, 1);
    const maturity = new Date(2031, 0, 1);
    const d = call('DURATION', [settle, maturity, 0.05, 0.05, 2, 0]) as number;
    const md = call('MDURATION', [settle, maturity, 0.05, 0.05, 2, 0]) as number;
    expect(md).toBeLessThan(d);
  });

  it('COUPNUM rejects invalid frequency', () => {
    expect(call('COUPNUM', [new Date(2026, 0, 1), new Date(2031, 0, 1), 3])).toBe(NUM_ERROR);
  });
});
