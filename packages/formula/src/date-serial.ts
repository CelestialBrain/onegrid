// =============================================================================
// Excel date-serial conversion (v1.1.0 wave 19).
//
// Excel stores dates as floating-point serial numbers: integer part = days
// since the epoch, fractional part = time-of-day. Three date systems exist:
//
//   1900           — default; epoch is 1900-01-01 (serial 1). PRESERVES the
//                    Lotus 1-2-3 leap-year-1900 bug for round-trip fidelity:
//                    serial 60 maps to a non-existent 1900-02-29. Required
//                    for OOXML round-trip with workbooks saved by Excel.
//   1900-strict    — same epoch but NO leap-year bug. Strict math; breaks
//                    .xlsx round-trip but useful for clean numerical work.
//   1904           — Mac-style; epoch is 1904-01-01 (serial 0). Used by
//                    .xlsx files saved with `<workbookPr date1904="1"/>`.
//
// These helpers are opt-in — adopters who already work in JS `Date` objects
// don't need them. The OOXML writer (wave 22) will route every date cell
// through `dateToSerial`; the reader through `serialToDate`.
// =============================================================================

export type DateSystem = '1900' | '1900-strict' | '1904';

const MS_PER_DAY = 86_400_000;

function epoch(system: DateSystem): Date {
  if (system === '1904') return new Date(Date.UTC(1904, 0, 1));
  // Both 1900 modes use 1899-12-31 as serial 0 so serial 1 == 1900-01-01.
  // The Lotus-1-2-3 leap-year bug shows up at serial 60 (phantom
  // 1900-02-29); handled as a slot-shift in the converters below.
  return new Date(Date.UTC(1899, 11, 31));
}

/**
 * Convert a JS Date (UTC) to an Excel-style serial number under the named
 * date system. Times are preserved as the fractional portion.
 */
export function dateToSerial(d: Date, system: DateSystem = '1900'): number {
  const ms = d.getTime() - epoch(system).getTime();
  const days = ms / MS_PER_DAY;
  if (system === '1900') {
    // Bug-compat: every date on or after 1900-03-01 sits one slot higher
    // than the strict-math answer would put it (Excel reserves slot 60
    // for phantom 1900-02-29, pushing 1900-03-01 to slot 61).
    const mar1 = Date.UTC(1900, 2, 1);
    if (d.getTime() >= mar1) return days + 1;
  }
  return days;
}

/**
 * Inverse of `dateToSerial`. Serial 60 in `'1900'` mode maps to the
 * phantom 1900-02-29 — we return 1900-02-29 as a JS Date (which JS
 * normalizes to 1900-03-01) so the round-trip stays callable. Adopters
 * who need to surface the phantom slot explicitly should call
 * `isPhantomLeapSlot(serial, '1900')` first.
 */
export function serialToDate(serial: number, system: DateSystem = '1900'): Date {
  let s = serial;
  if (system === '1900' && s >= 61) s -= 1;
  return new Date(epoch(system).getTime() + s * MS_PER_DAY);
}

/**
 * `1900` strict-math distinguishes the phantom slot (60) from real dates:
 * `isPhantomLeapSlot(60) === true` in `'1900'` mode (the bug slot),
 * false in `'1900-strict'` and `'1904'`.
 */
export function isPhantomLeapSlot(serial: number, system: DateSystem = '1900'): boolean {
  return system === '1900' && Math.trunc(serial) === 60;
}
