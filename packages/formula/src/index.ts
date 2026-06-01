// =============================================================================
// @onegrid/formula
//
// Excel-compatible formula engine. Native parser (no GPL entanglement),
// recursive-descent expression grammar, ~30 built-in functions, and an
// evaluator that resolves cell / range references through a user-supplied
// CellResolver.
//
// Public API:
//   - parseFormula(input)           → AST
//   - evaluate(node, resolver)      → value | FormulaError
//   - createFormulaEngine()         → { evaluate, registerFunction, ... }
//   - FormulaError + isFormulaError + error sentinels (DIV_ZERO, etc.)
//
// Roadmap (not yet shipped):
//   - Linear range decomposition (sharing work across overlapping aggregates)
//   - More functions (VLOOKUP, INDEX, MATCH, statistical, financial)
//   - Array formulas / dynamic arrays
//
// =============================================================================

import { parseFormula } from './parser';
import { evaluate, type CellResolver } from './evaluator';
import {
  getFunction,
  listFormulaFunctions,
  registerFormulaFunction,
  type FormulaFn,
} from './functions';
import { isFormulaError, FormulaError } from './errors';

/** @public */
export interface FormulaEngine {
  /** Parse a formula string and return its AST. Throws on syntax errors. */
  readonly parse: (input: string) => ReturnType<typeof parseFormula>;
  /** Parse + evaluate. Returns the value or a FormulaError sentinel. */
  readonly evaluate: (input: string, resolver: CellResolver) => unknown;
  /** Register a custom function. Built-in names CAN be overridden. */
  readonly registerFunction: (name: string, fn: FormulaFn) => void;
  /** List all registered function names. */
  readonly listFunctions: () => string[];
}

/** @public */
export function createFormulaEngine(): FormulaEngine {
  return {
    parse: parseFormula,
    evaluate: (input, resolver) => {
      try {
        const ast = parseFormula(input);
        return evaluate(ast, resolver);
      } catch (err) {
        if (err instanceof FormulaError) return err;
        return new FormulaError('#VALUE!', String(err));
      }
    },
    registerFunction: registerFormulaFunction,
    listFunctions: listFormulaFunctions,
  };
}

// Direct exports for power users who want to bypass the engine wrapper.
export { parseFormula } from './parser';
export { evaluate } from './evaluator';
export { isFormulaError, FormulaError };
export {
  registerFormulaFunction,
  getFunction,
  listFormulaFunctions,
  type FormulaFn,
} from './functions';
export type { CellResolver } from './evaluator';
export type { FormulaNode } from './ast';
export {
  DIV_ZERO,
  VALUE_ERROR,
  NAME_ERROR,
  REF_ERROR,
  NA_ERROR,
  NUM_ERROR,
  SPILL_ERROR,
} from './errors';
export type { FormulaErrorCode } from './errors';

// Wave 17: dynamic-array spill registry. Adopters wire `SpillTracker`
// into the resolver via the optional `getSpill` hook.
export { SpillTracker, asSpilled, checkSpillCollision } from './spill';
export type { SpillExtent, SpillRecord } from './spill';

export { FormulaSyntaxError } from './tokenizer';

// -----------------------------------------------------------------------------
// Incremental engine — Adapton-style demand-driven recompute.
// -----------------------------------------------------------------------------

export { createIncrementalEngine } from './incremental';
export type { EngineStats, IncrementalFormulaEngine } from './incremental';

export { DependencyGraph } from './dependency-graph';

export {
  expandRange,
  isRangeId,
  isWholeColumnRange,
  letterToIndex,
  indexToLetter,
  normalizeCellRef,
  normalizeRangeRef,
  parseCellRef,
  parseRangeRef,
  DEFAULT_WHOLE_COLUMN_MAX_ROW,
} from './range';
export type { CellRef, ParseRangeOptions } from './range';
