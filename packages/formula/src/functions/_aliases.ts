// =============================================================================
// Cross-category aliases. Must load AFTER every primary registration so
// `getFunction(<name>)` resolves the canonical implementation.
//
// The barrel `functions.ts` imports each category in dependency order, then
// this file last.
// =============================================================================

import { getFunction, register } from './_shared';

// Math
register('AVG', getFunction('AVERAGE')!);

// Text
register('CONCATENATE', getFunction('CONCAT')!);
register('UNICHAR', getFunction('CHAR')!);

// Stats
register('MODE', getFunction('MODE.SNGL')!);
register('STDEV', getFunction('STDEV.S')!);
register('STDEVP', getFunction('STDEV.P')!);
register('VAR', getFunction('VAR.S')!);
register('VARP', getFunction('VAR.P')!);
register('RANK', getFunction('RANK.EQ')!);
register('PERCENTILE', getFunction('PERCENTILE.INC')!);
register('QUARTILE', getFunction('QUARTILE.INC')!);
register('PEARSON', getFunction('CORREL')!);
register('COVAR', getFunction('COVARIANCE.P')!);
