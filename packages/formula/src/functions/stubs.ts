// =============================================================================
// Deferred-function stubs (v1.1.0 wave 10).
//
// These functions exist in Excel but require infrastructure this engine
// doesn't expose: cell-metadata introspection (CELL, FORMULATEXT, ISFORMULA,
// ISREF, SHEET, SHEETS), the host environment (INFO), pivot tables
// (GETPIVOTDATA), real-time data feeds (RTD), embedded images (IMAGE), and
// CJK locale-specific text handling (BAHTTEXT, ASC, JIS, DBCS, PHONETIC).
// Registered as #NAME! so formulas parse but signal "not implemented", same
// pattern as OFFSET / INDIRECT / CUBE.*.
//
// VALUETOTEXT / ARRAYTOTEXT are implementable today.
// =============================================================================

import { NAME_ERROR } from '../errors';
import { register, to2D } from './_shared';

// Pure stubs.
for (const name of [
  'CELL',
  'INFO',
  'SHEET',
  'SHEETS',
  'FORMULATEXT',
  'GETPIVOTDATA',
  'RTD',
  'IMAGE',
  'AREAS',
  'BAHTTEXT',
  'ASC',
  'JIS',
  'DBCS',
  'PHONETIC',
]) {
  register(name, () => NAME_ERROR);
}

// Without an evaluator hook we can't distinguish formula cells from value
// cells; these conservatively return false. Excel users who care about the
// difference should wire a custom resolver.
register('ISFORMULA', () => false);
register('ISREF', () => false);

// VALUETOTEXT(value, [format]). format 0 = unquoted (default), 1 = strict
// (strings get double-quoted, errors as text).
register('VALUETOTEXT', (args) => {
  const v = args[0];
  const fmt = args[1] === 1 ? 1 : 0;
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return fmt === 1 ? `"${v}"` : v;
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return String(v);
});

// ARRAYTOTEXT(array, [format]). format 0 = "a, b, c"; 1 = "{a;b;c}" with rows.
register('ARRAYTOTEXT', (args) => {
  const a = to2D(args[0]);
  const fmt = args[1] === 1 ? 1 : 0;
  const cell = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return fmt === 1 ? `"${v}"` : v;
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return String(v);
  };
  if (fmt === 1) {
    return `{${a.map((r) => r.map(cell).join(',')).join(';')}}`;
  }
  return a.flat().map(cell).join(', ');
});
