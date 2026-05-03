// =============================================================================
// @onegrid/formula
//
// Excel-compatible formula engine. Native parser (no GPL license entanglement),
// dependency graph with range-node decomposition, Adapton-style demand-driven
// recompute, signals integration.
//
// Public API surface (planned). Implementations TODO.
// =============================================================================

export interface FormulaCell {
  readonly source: string;
  readonly value: unknown;
  readonly error?: FormulaError;
}

export interface FormulaError {
  readonly code: string;
  readonly message: string;
}

export interface FormulaEngine {
  readonly setCell: (cellId: string, source: string) => void;
  readonly clearCell: (cellId: string) => void;
  readonly getValue: (cellId: string) => unknown;
  readonly recompute: () => void;
  readonly registerFunction: (name: string, fn: (...args: unknown[]) => unknown) => void;
}

export const createFormulaEngine = (): FormulaEngine => {
  throw new Error('@onegrid/formula: createFormulaEngine is not implemented yet.');
};

export const parseFormula = (_source: string): unknown => {
  throw new Error('@onegrid/formula: parseFormula is not implemented yet.');
};
