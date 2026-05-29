// =============================================================================
// Logical category — IF / AND / OR / NOT / IFERROR + v1.1.0 IFS/SWITCH/IFNA/XOR.
// =============================================================================

import { compare, toBoolean } from '../coerce';
import { NA_ERROR, isFormulaError } from '../errors';
import { flatten, register } from './_shared';

register('IF', (args) => {
  const test = toBoolean(args[0]);
  if (isFormulaError(test)) return test;
  return test ? args[1] : args.length > 2 ? args[2] : false;
});

register('AND', (args) => {
  for (const a of flatten(args)) {
    const b = toBoolean(a);
    if (isFormulaError(b)) return b;
    if (!b) return false;
  }
  return true;
});

register('OR', (args) => {
  for (const a of flatten(args)) {
    const b = toBoolean(a);
    if (isFormulaError(b)) return b;
    if (b) return true;
  }
  return false;
});

register('NOT', (args) => {
  const b = toBoolean(args[0]);
  return isFormulaError(b) ? b : !b;
});

register('IFERROR', (args) => {
  const v = args[0];
  if (isFormulaError(v)) return args[1] ?? '';
  return v;
});

register('TRUE', () => true);
register('FALSE', () => false);

// ----- v1.1.0 expansion -----------------------------------------------------

register('IFS', (args) => {
  if (args.length % 2 !== 0) return NA_ERROR;
  for (let i = 0; i < args.length; i += 2) {
    const b = toBoolean(args[i]);
    if (isFormulaError(b)) return b;
    if (b) return args[i + 1];
  }
  return NA_ERROR;
});

register('SWITCH', (args) => {
  if (args.length < 3) return NA_ERROR;
  const expr = args[0];
  const tail = args.slice(1);
  const hasDefault = tail.length % 2 === 1;
  const limit = hasDefault ? tail.length - 1 : tail.length;
  for (let i = 0; i < limit; i += 2) {
    if (compare(expr, tail[i]) === 0) return tail[i + 1];
  }
  return hasDefault ? tail[tail.length - 1] : NA_ERROR;
});

register('IFNA', (args) => {
  const v = args[0];
  if (isFormulaError(v) && v === NA_ERROR) return args[1] ?? '';
  return v;
});

register('XOR', (args) => {
  let trueCount = 0;
  for (const a of flatten(args)) {
    const b = toBoolean(a);
    if (isFormulaError(b)) return b;
    if (b) trueCount++;
  }
  return trueCount % 2 === 1;
});
