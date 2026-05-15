// =============================================================================
// Evaluator
//
// Walks a parsed AST and produces a value (or FormulaError). Cell and range
// references resolve through a CellResolver the caller provides.
//
// Strict propagation: if any operand is a FormulaError, the error becomes
// the result. Functions get the same treatment unless they explicitly
// handle errors (e.g. IFERROR, ISERROR).
// =============================================================================

import type { FormulaNode } from './ast';
import {
  addNumeric,
  compare,
  divNumeric,
  mulNumeric,
  subNumeric,
  toBoolean,
  toNumber,
  toString_,
} from './coerce';
import {
  DIV_ZERO,
  FormulaError,
  NAME_ERROR,
  REF_ERROR,
  VALUE_ERROR,
  isFormulaError,
} from './errors';
import { getFunction } from './functions';

export interface CellResolver {
  /** Resolve a single-cell reference (e.g. "A1" or "$A$1"). */
  readonly getCell: (ref: string) => unknown;
  /** Resolve a range reference (e.g. "A1:B10") to a flat array of values. */
  readonly getRange: (ref: string) => ReadonlyArray<unknown>;
}

export function evaluate(node: FormulaNode, resolver: CellResolver): unknown {
  switch (node.kind) {
    case 'number':
      return node.value;
    case 'string':
      return node.value;
    case 'boolean':
      return node.value;
    case 'cellRef':
      try {
        return resolver.getCell(node.ref);
      } catch {
        return REF_ERROR;
      }
    case 'rangeRef':
      try {
        return resolver.getRange(node.ref) as unknown;
      } catch {
        return REF_ERROR;
      }
    case 'percent': {
      const v = evaluate(node.operand, resolver);
      if (isFormulaError(v)) return v;
      const n = toNumber(v);
      return isFormulaError(n) ? n : n / 100;
    }
    case 'unary': {
      const v = evaluate(node.operand, resolver);
      if (isFormulaError(v)) return v;
      const n = toNumber(v);
      if (isFormulaError(n)) return n;
      return node.op === '-' ? -n : n;
    }
    case 'binary':
      return evalBinary(node.op, node.left, node.right, resolver);
    case 'call':
      return evalCall(node.name, node.args, resolver);
  }
}

function evalBinary(
  op: string,
  leftNode: FormulaNode,
  rightNode: FormulaNode,
  resolver: CellResolver,
): unknown {
  const l = evaluate(leftNode, resolver);
  if (isFormulaError(l)) return l;
  const r = evaluate(rightNode, resolver);
  if (isFormulaError(r)) return r;

  switch (op) {
    case '+':
      return addNumeric(l, r);
    case '-':
      return subNumeric(l, r);
    case '*':
      return mulNumeric(l, r);
    case '/':
      return divNumeric(l, r);
    case '^': {
      // ^ is always float (BigInt exponentiation `a ** b` requires both
      // bigint; Excel allows fractional + negative exponents we can't
      // represent in BigInt anyway).
      const a = toNumber(l);
      const b = toNumber(r);
      if (isFormulaError(a)) return a;
      if (isFormulaError(b)) return b;
      return Math.pow(a, b);
    }
    case '&':
      return toString_(l) + toString_(r);
    case '=':
      return compare(l, r) === 0;
    case '<>':
      return compare(l, r) !== 0;
    case '<':
      return compare(l, r) < 0;
    case '<=':
      return compare(l, r) <= 0;
    case '>':
      return compare(l, r) > 0;
    case '>=':
      return compare(l, r) >= 0;
    default:
      return VALUE_ERROR;
  }
}

function evalCall(
  name: string,
  argsNodes: ReadonlyArray<FormulaNode>,
  resolver: CellResolver,
): unknown {
  const fn = getFunction(name);
  if (!fn) return NAME_ERROR;

  // Evaluate args. Errors propagate UNLESS the function explicitly handles
  // them (IFERROR, ISERROR). Per-function error opt-in via metadata is on
  // the roadmap; for now IFERROR/ISERROR/ISBLANK are special-cased here.
  const upper = name.toUpperCase();
  const handlesErrors = upper === 'IFERROR' || upper === 'ISERROR' || upper === 'ISBLANK';

  const evaluated: unknown[] = [];
  for (const a of argsNodes) {
    const v = evaluate(a, resolver);
    if (!handlesErrors && isFormulaError(v)) return v;
    evaluated.push(v);
  }
  try {
    return fn(evaluated);
  } catch (err) {
    if (err instanceof FormulaError) return err;
    return VALUE_ERROR;
  }
}

// Re-export for convenience.
export { isFormulaError, FormulaError };
