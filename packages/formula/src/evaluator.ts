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
import { setCallContext } from './functions/_shared';

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
  const upper = name.toUpperCase();

  // LET(name1, value1, [name2, value2, ...], body) — sequential bindings.
  // Body is evaluated with a chained resolver that substitutes the bound
  // names. Excel scope rule: later bindings see earlier ones.
  if (upper === 'LET') return evalLet(argsNodes, resolver);

  const fn = getFunction(name);
  if (!fn) {
    // Zero-arg bare-identifier path: a LET binding (or potential future
    // named-range) lives in the resolver under its identifier. Defer to
    // the resolver; if that also misses, surface #NAME?.
    if (argsNodes.length === 0) {
      try {
        const v = resolver.getCell(name);
        if (v !== null && v !== undefined) return v;
      } catch {
        // fall through to NAME_ERROR
      }
    }
    return NAME_ERROR;
  }

  // Evaluate args. Errors propagate UNLESS the function explicitly handles
  // them (IFERROR, ISERROR). Per-function error opt-in via metadata is on
  // the roadmap; for now IFERROR/ISERROR/ISBLANK are special-cased here.
  const handlesErrors = upper === 'IFERROR' || upper === 'ISERROR' || upper === 'ISBLANK';

  const evaluated: unknown[] = [];
  for (const a of argsNodes) {
    const v = evaluate(a, resolver);
    if (!handlesErrors && isFormulaError(v)) return v;
    evaluated.push(v);
  }
  const prev = setCallContextScoped({ argNodes: argsNodes, resolver });
  try {
    return fn(evaluated);
  } catch (err) {
    if (err instanceof FormulaError) return err;
    return VALUE_ERROR;
  } finally {
    setCallContext(prev);
  }
}

function evalLet(
  argsNodes: ReadonlyArray<FormulaNode>,
  resolver: CellResolver,
): unknown {
  // Must have at least one (name, value) pair and a body.
  if (argsNodes.length < 3 || argsNodes.length % 2 === 0) return VALUE_ERROR;
  const bindings = new Map<string, unknown>();
  // Names appear in the AST as cellRef nodes (single-letter+digit ones)
  // — Excel reuses that token shape — or as bare identifiers parsed as
  // a function call with zero args. The parser here surfaces them as
  // `cellRef` for short names (A1-like) and `call` with empty args for
  // pure identifiers like `myVar`. Cover both.
  function bindingName(n: FormulaNode): string | undefined {
    if (n.kind === 'cellRef' || n.kind === 'rangeRef') return n.ref;
    if (n.kind === 'call' && n.args.length === 0) return n.name;
    return undefined;
  }
  const chained: CellResolver = {
    getCell: (ref) => (bindings.has(ref) ? bindings.get(ref) : resolver.getCell(ref)),
    getRange: (ref) => resolver.getRange(ref),
  };
  for (let i = 0; i < argsNodes.length - 1; i += 2) {
    const nameNode = argsNodes[i]!;
    const valueNode = argsNodes[i + 1]!;
    const name = bindingName(nameNode);
    if (!name) return VALUE_ERROR;
    bindings.set(name, evaluate(valueNode, chained));
  }
  return evaluate(argsNodes[argsNodes.length - 1]!, chained);
}

function setCallContextScoped(
  ctx: { argNodes: ReadonlyArray<FormulaNode>; resolver: CellResolver },
): undefined {
  // We don't restore a stack — call() is the only entry that nests, and the
  // finally above clears to `undefined`. Sufficient for the introspection
  // functions which only read the immediate context.
  setCallContext({ argNodes: ctx.argNodes, resolver: ctx.resolver });
  return undefined;
}

// Re-export for convenience.
export { isFormulaError, FormulaError };
