// =============================================================================
// @onegrid/formula — v1.1.0 wave 4: date / time expansion.
// =============================================================================

import { describe, expect, it } from 'vitest';
import { getFunction } from '../functions';
import { NUM_ERROR, VALUE_ERROR } from '../errors';

const call = (name: string, args: unknown[]): unknown => {
  const fn = getFunction(name);
  if (!fn) throw new Error(`function ${name} not registered`);
  return fn(args);
};

describe('@onegrid/formula — DATE / TIME / DATEVALUE / TIMEVALUE', () => {
  it('DATE constructs a JS Date with month overflow', () => {
    const d = call('DATE', [2026, 1, 15]) as Date;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(15);
  });

  it('DATE with month=13 rolls into next year', () => {
    const d = call('DATE', [2026, 13, 1]) as Date;
    expect(d.getFullYear()).toBe(2027);
    expect(d.getMonth()).toBe(0);
  });

  it('TIME returns a fraction-of-a-day', () => {
    expect(call('TIME', [0, 0, 0])).toBe(0);
    expect(call('TIME', [12, 0, 0])).toBeCloseTo(0.5, 10);
    expect(call('TIME', [6, 0, 0])).toBeCloseTo(0.25, 10);
    expect(call('TIME', [-1, 0, 0])).toBe(NUM_ERROR);
  });

  it('DATEVALUE parses a date string to a local-midnight Date', () => {
    const d = call('DATEVALUE', ['2026-05-29']) as Date;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(4);
    expect(d.getDate()).toBe(29);
    expect(call('DATEVALUE', ['not-a-date'])).toBe(VALUE_ERROR);
  });

  it('TIMEVALUE parses common time strings', () => {
    expect(call('TIMEVALUE', ['12:00'])).toBeCloseTo(0.5, 10);
    expect(call('TIMEVALUE', ['6:00:00'])).toBeCloseTo(0.25, 10);
    expect(call('TIMEVALUE', ['1:00 PM'])).toBeCloseTo(13 / 24, 10);
    expect(call('TIMEVALUE', ['12:00 AM'])).toBeCloseTo(0, 10);
  });
});

describe('@onegrid/formula — HOUR / MINUTE / SECOND', () => {
  it('HOUR / MINUTE / SECOND on a Date', () => {
    const d = new Date(2026, 4, 29, 14, 30, 45);
    expect(call('HOUR', [d])).toBe(14);
    expect(call('MINUTE', [d])).toBe(30);
    expect(call('SECOND', [d])).toBe(45);
  });

  it('HOUR / MINUTE / SECOND on a fractional-day number', () => {
    expect(call('HOUR', [0.5])).toBe(12);
    expect(call('MINUTE', [0.5 + 30 / 1440])).toBe(30);
    expect(call('SECOND', [0.5])).toBe(0);
  });
});

describe('@onegrid/formula — WEEKDAY / WEEKNUM / ISOWEEKNUM', () => {
  it('WEEKDAY default Sun=1..Sat=7', () => {
    // 2026-05-31 is a Sunday.
    expect(call('WEEKDAY', [new Date(2026, 4, 31)])).toBe(1);
    // 2026-05-29 is a Friday.
    expect(call('WEEKDAY', [new Date(2026, 4, 29)])).toBe(6);
  });

  it('WEEKDAY return_type 2 = Mon=1..Sun=7', () => {
    expect(call('WEEKDAY', [new Date(2026, 4, 31), 2])).toBe(7); // Sunday
    expect(call('WEEKDAY', [new Date(2026, 4, 29), 2])).toBe(5); // Friday
  });

  it('ISOWEEKNUM follows ISO 8601 (Thursday-anchored)', () => {
    // 2026-01-01 is a Thursday → week 1.
    expect(call('ISOWEEKNUM', [new Date(2026, 0, 1)])).toBe(1);
    // 2025-12-29 (Monday) is in ISO week 1 of 2026.
    expect(call('ISOWEEKNUM', [new Date(2025, 11, 29)])).toBe(1);
  });

  it('WEEKNUM return_type 21 delegates to ISOWEEKNUM', () => {
    expect(call('WEEKNUM', [new Date(2025, 11, 29), 21])).toBe(1);
  });
});

describe('@onegrid/formula — DAYS / DAYS360', () => {
  it('DAYS returns the simple day delta', () => {
    expect(call('DAYS', [new Date(2026, 0, 11), new Date(2026, 0, 1)])).toBe(10);
  });

  it('DAYS360 US convention treats Jan 31 → Mar 31 as 60 days', () => {
    expect(call('DAYS360', [new Date(2026, 0, 31), new Date(2026, 2, 31)])).toBe(60);
  });

  it('DAYS360 European method optional flag', () => {
    expect(call('DAYS360', [new Date(2026, 0, 31), new Date(2026, 2, 30), true])).toBe(60);
  });
});

describe('@onegrid/formula — EDATE / EOMONTH', () => {
  it('EDATE adds calendar months with day-overflow clamping', () => {
    const r = call('EDATE', [new Date(2026, 0, 31), 1]) as Date;
    expect(r.getMonth()).toBe(1); // Feb
    expect(r.getDate()).toBe(28); // 2026 not a leap year
  });

  it('EOMONTH returns the last day of the target month', () => {
    const r = call('EOMONTH', [new Date(2026, 0, 15), 1]) as Date;
    expect(r.getMonth()).toBe(1);
    expect(r.getDate()).toBe(28);
  });

  it('EOMONTH negative months goes back', () => {
    const r = call('EOMONTH', [new Date(2026, 0, 15), -1]) as Date;
    expect(r.getFullYear()).toBe(2025);
    expect(r.getMonth()).toBe(11);
    expect(r.getDate()).toBe(31);
  });
});

describe('@onegrid/formula — YEARFRAC', () => {
  it('basis 0 (30/360 US) on a full year ≈ 1', () => {
    expect(call('YEARFRAC', [new Date(2026, 0, 1), new Date(2027, 0, 1)])).toBeCloseTo(1, 4);
  });

  it('basis 3 (act/365) on 365 days = 1.0', () => {
    expect(call('YEARFRAC', [new Date(2025, 0, 1), new Date(2026, 0, 1), 3])).toBeCloseTo(1, 10);
  });

  it('basis 2 (act/360) on 360 days = 1.0', () => {
    expect(call('YEARFRAC', [new Date(2025, 0, 1), new Date(2025, 11, 27), 2])).toBeCloseTo(1, 10);
  });
});

describe('@onegrid/formula — DATEDIF', () => {
  it("Y / M / D between two dates", () => {
    const a = new Date(2020, 4, 15);
    const b = new Date(2026, 4, 29);
    expect(call('DATEDIF', [a, b, 'Y'])).toBe(6);
    expect(call('DATEDIF', [a, b, 'M'])).toBe(6 * 12 + 0);
    expect(call('DATEDIF', [a, b, 'D'])).toBe(2205); // 2020-05-15 → 2026-05-29
  });

  it('YM and MD: in-year residuals', () => {
    expect(call('DATEDIF', [new Date(2020, 0, 15), new Date(2026, 4, 29), 'YM'])).toBe(4);
    expect(call('DATEDIF', [new Date(2020, 0, 15), new Date(2026, 4, 29), 'MD'])).toBe(14);
  });

  it('end < start → #NUM!', () => {
    expect(call('DATEDIF', [new Date(2026, 0, 1), new Date(2025, 0, 1), 'D'])).toBe(NUM_ERROR);
  });
});

describe('@onegrid/formula — NETWORKDAYS / WORKDAY (+ .INTL)', () => {
  it('NETWORKDAYS counts Mon-Fri, excluding holidays', () => {
    // 2026-05-25 (Mon) through 2026-05-29 (Fri) = 5 workdays.
    expect(
      call('NETWORKDAYS', [new Date(2026, 4, 25), new Date(2026, 4, 29)]),
    ).toBe(5);
    // Exclude Wed (2026-05-27) as a holiday → 4.
    expect(
      call('NETWORKDAYS', [
        new Date(2026, 4, 25),
        new Date(2026, 4, 29),
        [new Date(2026, 4, 27)],
      ]),
    ).toBe(4);
  });

  it('NETWORKDAYS.INTL with weekend numeric code', () => {
    // weekend=11 → Sundays only. So Mon-Sat (2026-05-25..30) = 6 workdays.
    expect(
      call('NETWORKDAYS.INTL', [new Date(2026, 4, 25), new Date(2026, 4, 30), 11]),
    ).toBe(6);
  });

  it('NETWORKDAYS.INTL with weekend string mask', () => {
    // "0000001" → Sunday only.
    expect(
      call('NETWORKDAYS.INTL', [new Date(2026, 4, 25), new Date(2026, 4, 30), '0000001']),
    ).toBe(6);
  });

  it('WORKDAY adds N workdays', () => {
    // From Mon 2026-05-25, +5 workdays = Mon 2026-06-01.
    const r = call('WORKDAY', [new Date(2026, 4, 25), 5]) as Date;
    expect(r.getMonth()).toBe(5); // June
    expect(r.getDate()).toBe(1);
  });

  it('WORKDAY with holidays skips them', () => {
    // From Mon 2026-05-25, +3 normally = Thu 2026-05-28. Skip Wed → still Thu.
    const r = call('WORKDAY', [new Date(2026, 4, 25), 3, [new Date(2026, 4, 27)]]) as Date;
    // Skipping Wed means +3 workdays lands on Fri 2026-05-29 instead.
    expect(r.getMonth()).toBe(4);
    expect(r.getDate()).toBe(29);
  });

  it('WORKDAY.INTL with mask', () => {
    // Sunday-only weekend; from Mon 2026-05-25 + 5 = Sat 2026-05-30.
    const r = call('WORKDAY.INTL', [new Date(2026, 4, 25), 5, 11]) as Date;
    expect(r.getMonth()).toBe(4);
    expect(r.getDate()).toBe(30);
  });
});
