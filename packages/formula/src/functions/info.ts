// =============================================================================
// Info category — ISNUMBER / ISTEXT / ISBLANK / ISERROR + v1.1.0 ISNA/ISERR/
// ISLOGICAL/ISEVEN/ISODD/N/NA/TYPE/ERROR.TYPE.
// =============================================================================

import { toNumber } from '../coerce';
import {
  DIV_ZERO,
  type FormulaError,
  NA_ERROR,
  NAME_ERROR,
  NUM_ERROR,
  VALUE_ERROR,
  isFormulaError,
} from '../errors';
import { register } from './_shared';

register('ISNUMBER', (args) => typeof args[0] === 'number');
register('ISTEXT', (args) => typeof args[0] === 'string');
register('ISBLANK', (args) => args[0] === null || args[0] === undefined || args[0] === '');
register('ISERROR', (args) => isFormulaError(args[0]));

// ----- v1.1.0 -----

register('ISNA', (args) => isFormulaError(args[0]) && (args[0] as FormulaError) === NA_ERROR);
register('ISERR', (args) => isFormulaError(args[0]) && (args[0] as FormulaError) !== NA_ERROR);
register('ISLOGICAL', (args) => typeof args[0] === 'boolean');

register('ISEVEN', (args) => {
  const n = toNumber(args[0]);
  if (isFormulaError(n)) return n;
  return Math.trunc(n) % 2 === 0;
});

register('ISODD', (args) => {
  const n = toNumber(args[0]);
  if (isFormulaError(n)) return n;
  return Math.abs(Math.trunc(n)) % 2 === 1;
});

register('N', (args) => {
  const v = args[0];
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v.getTime();
  return 0;
});

register('NA', () => NA_ERROR);

register('TYPE', (args) => {
  // 1=number, 2=text, 4=logical, 16=error, 64=array.
  const v = args[0];
  if (typeof v === 'number') return 1;
  if (typeof v === 'string') return 2;
  if (typeof v === 'boolean') return 4;
  if (isFormulaError(v)) return 16;
  if (Array.isArray(v)) return 64;
  return 1;
});

register('ERROR.TYPE', (args) => {
  const v = args[0];
  if (!isFormulaError(v)) return NA_ERROR;
  switch (v) {
    case NA_ERROR:
      return 7;
    case DIV_ZERO:
      return 2;
    case NUM_ERROR:
      return 6;
    case VALUE_ERROR:
      return 3;
    case NAME_ERROR:
      return 5;
    default:
      return 8;
  }
});
