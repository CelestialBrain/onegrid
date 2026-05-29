// =============================================================================
// @onegrid/formula — v1.1.0 wave 12: financial extras.
// =============================================================================

import { describe, expect, it } from 'vitest';
import { getFunction } from '../functions';
import { NAME_ERROR } from '../errors';

const call = (name: string, args: unknown[]): unknown => {
  const fn = getFunction(name);
  if (!fn) throw new Error(`function ${name} not registered`);
  return fn(args);
};

describe('@onegrid/formula — CUMIPMT / CUMPRINC', () => {
  it('CUMIPMT first year of a 30-year mortgage', () => {
    // Microsoft Excel example: 9% annual / 12 = 0.0075, 30y * 12 = 360 nper,
    // 125000 PV → CUMIPMT(0.0075, 360, 125000, 13, 24, 0) ≈ -11135.23
    expect(call('CUMIPMT', [0.0075, 360, 125000, 13, 24, 0]) as number).toBeCloseTo(
      -11135.23,
      1,
    );
  });

  it('CUMPRINC over full term ≈ -principal', () => {
    const r = call('CUMPRINC', [0.0075, 360, 125000, 1, 360, 0]) as number;
    expect(r).toBeCloseTo(-125000, 1);
  });
});

describe('@onegrid/formula — EFFECT / NOMINAL', () => {
  it('EFFECT of 5% compounded monthly', () => {
    expect(call('EFFECT', [0.05, 12]) as number).toBeCloseTo(0.0511619, 6);
  });

  it('NOMINAL ↔ EFFECT round-trip', () => {
    const eff = call('EFFECT', [0.06, 4]) as number;
    expect(call('NOMINAL', [eff, 4]) as number).toBeCloseTo(0.06, 8);
  });
});

describe('@onegrid/formula — ISPMT / RRI / PDURATION', () => {
  it('ISPMT halfway through is half the first-period interest', () => {
    // ISPMT(0.1, 1, 4, 100000) = -100000 * 0.1 * (1 - 1/4) = -7500
    expect(call('ISPMT', [0.1, 1, 4, 100000])).toBe(-7500);
  });

  it('RRI: pv=10000, fv=20000, nper=10 → ~7.18%', () => {
    expect(call('RRI', [10, 10000, 20000]) as number).toBeCloseTo(
      Math.pow(2, 0.1) - 1,
      8,
    );
  });

  it('PDURATION: years to double at 5%', () => {
    expect(call('PDURATION', [0.05, 1, 2]) as number).toBeCloseTo(
      Math.log(2) / Math.log(1.05),
      6,
    );
  });
});

describe('@onegrid/formula — DOLLARDE / DOLLARFR', () => {
  it('DOLLARDE 1.02 in 16ths = 1.125', () => {
    expect(call('DOLLARDE', [1.02, 16]) as number).toBeCloseTo(1.125, 8);
  });

  it('DOLLARFR ↔ DOLLARDE round-trip', () => {
    const v = 1.125;
    const fr = call('DOLLARFR', [v, 16]) as number;
    expect(call('DOLLARDE', [fr, 16]) as number).toBeCloseTo(v, 6);
  });
});

describe('@onegrid/formula — securities', () => {
  // settlement 2008-02-15, maturity 2008-05-15 → 90 days actual.
  const s = '2008-02-15';
  const m = '2008-05-15';

  it('DISC ≈ (1 - pr/red) * 360/days', () => {
    expect(call('DISC', [s, m, 97.975, 100]) as number).toBeCloseTo(
      ((100 - 97.975) / 100) * (360 / 90),
      6,
    );
  });

  it('INTRATE', () => {
    expect(call('INTRATE', [s, m, 1000000, 1014420]) as number).toBeCloseTo(
      (14420 / 1000000) * (360 / 90),
      6,
    );
  });

  it('RECEIVED', () => {
    expect(call('RECEIVED', [s, m, 1000000, 0.0575]) as number).toBeCloseTo(
      1000000 / (1 - (0.0575 * 90) / 360),
      4,
    );
  });

  it('PRICEDISC formula', () => {
    // 100 - 100 * 0.045 * 90/360 = 98.875
    expect(call('PRICEDISC', [s, m, 0.045, 100]) as number).toBeCloseTo(98.875, 6);
  });

  it('YIELDDISC formula', () => {
    // ((100 - 98.875) / 98.875) * 360/90 = 0.04551...
    expect(call('YIELDDISC', [s, m, 98.875, 100]) as number).toBeCloseTo(
      ((100 - 98.875) / 98.875) * 4,
      6,
    );
  });
});

describe('@onegrid/formula — Treasury bills', () => {
  const s = '2008-03-31';
  const m = '2008-06-01';

  it('TBILLPRICE formula', () => {
    // 100 * (1 - 0.0914 * 62/360) where days = 62 (Mar-31 → Jun-1)
    const days = 62;
    expect(call('TBILLPRICE', [s, m, 0.0914]) as number).toBeCloseTo(
      100 * (1 - (0.0914 * days) / 360),
      6,
    );
  });

  it('TBILLYIELD formula', () => {
    expect(call('TBILLYIELD', [s, m, 98.45]) as number).toBeCloseTo(
      ((100 - 98.45) / 98.45) * (360 / 62),
      6,
    );
  });

  it('TBILLEQ > discount rate', () => {
    expect(call('TBILLEQ', [s, m, 0.0914]) as number).toBeGreaterThan(0.0914);
  });
});

describe('@onegrid/formula — deferred (day-count infra)', () => {
  for (const n of [
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
    it(`${n} returns #NAME!`, () => {
      expect(call(n, [])).toBe(NAME_ERROR);
    });
  }
});
