// =============================================================================
// Web + CUBE category (v1.1.0 wave 9).
//
// CUBE.* requires an OLAP connection that this engine doesn't model — they
// are registered as #NAME! stubs (same pattern as OFFSET / INDIRECT in
// lookup.ts) so formulas parse but signal "not implemented".
//
// WEBSERVICE / FILTERXML are similarly deferred: WEBSERVICE needs synchronous
// fetch in the evaluator (security review pending), and FILTERXML needs an
// XPath implementation that isn't a runtime dependency yet.
//
// ENCODEURL and HYPERLINK are implementable today:
//   - ENCODEURL wraps encodeURIComponent.
//   - HYPERLINK returns its friendly_name if given, else the URL. Cell-display
//     navigation lives at the UI layer, not in the formula engine.
// =============================================================================

import { type FormulaError, NAME_ERROR, VALUE_ERROR, isFormulaError } from '../errors';
import { register } from './_shared';

// ----- Web -------------------------------------------------------------------

register('ENCODEURL', (args) => {
  const v = args[0];
  if (v === null || v === undefined) return '';
  if (isFormulaError(v)) return v as FormulaError;
  return encodeURIComponent(String(v));
});

register('HYPERLINK', (args) => {
  const url = args[0];
  const friendly = args[1];
  if (isFormulaError(url)) return url as FormulaError;
  if (isFormulaError(friendly)) return friendly as FormulaError;
  if (friendly !== undefined && friendly !== null && friendly !== '') {
    return String(friendly);
  }
  if (url === undefined || url === null) return VALUE_ERROR;
  return String(url);
});

// Deferred — need the runtime infrastructure flagged in the file header.
register('WEBSERVICE', () => NAME_ERROR);
register('FILTERXML', () => NAME_ERROR);

// ----- CUBE (all stubs — no OLAP backend) -----------------------------------

register('CUBEKPIMEMBER', () => NAME_ERROR);
register('CUBEMEMBER', () => NAME_ERROR);
register('CUBEMEMBERPROPERTY', () => NAME_ERROR);
register('CUBERANKEDMEMBER', () => NAME_ERROR);
register('CUBESET', () => NAME_ERROR);
register('CUBESETCOUNT', () => NAME_ERROR);
register('CUBEVALUE', () => NAME_ERROR);
