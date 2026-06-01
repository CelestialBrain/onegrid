// =============================================================================
// Built-in function library — entry barrel.
//
// Excel-compatible names. Each function receives an array of evaluated
// arguments. Range references and arrays are flattened by the evaluator
// before being passed to functions, so SUM(A1:A10) and SUM(1, 2, 3) both
// see a flat number list (lookup-family functions opt into 2D handling
// via the `to2D` helper).
//
// Categories live under `./functions/` — one file per Excel category. The
// imports below are SIDE-EFFECT ONLY: each category module calls
// `register()` against the shared registry in `./functions/_shared` as it
// loads. `_aliases` runs last so cross-category aliases (AVG, MODE,
// CONCATENATE, etc.) resolve their canonical implementations.
// =============================================================================

import './functions/math';
import './functions/logical';
import './functions/text';
import './functions/datetime';
import './functions/info';
import './functions/lookup';
import './functions/stats';
import './functions/financial';
import './functions/engineering';
import './functions/database';
import './functions/web';
import './functions/math_extras';
import './functions/matrix';
import './functions/arrayshape';
import './functions/stubs';
import './functions/stats_extras';
import './functions/financial_extras';
import './functions/higherorder';
import './functions/cjk';
import './functions/_aliases';

export {
  type FormulaFn,
  getFunction,
  listFormulaFunctions,
  registerFormulaFunction,
} from './functions/_shared';

// Re-export sentinels kept for test-import compatibility with the old file.
export { NAME_ERROR, NA_ERROR } from './errors';
