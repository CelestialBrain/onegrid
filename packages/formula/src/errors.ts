// =============================================================================
// Formula errors. Excel-compatible "#…!" error values that propagate through
// expressions like sentinels: any operator/function that receives a
// FormulaError as input returns the same FormulaError as output.
// =============================================================================

export type FormulaErrorCode =
  | '#DIV/0!'
  | '#VALUE!'
  | '#NAME?'
  | '#REF!'
  | '#N/A'
  | '#NUM!'
  | '#SPILL!';

export class FormulaError extends Error {
  constructor(
    public readonly code: FormulaErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'FormulaError';
  }

  override toString(): string {
    return this.code;
  }
}

export const DIV_ZERO = new FormulaError('#DIV/0!');
export const VALUE_ERROR = new FormulaError('#VALUE!');
export const NAME_ERROR = new FormulaError('#NAME?');
export const REF_ERROR = new FormulaError('#REF!');
export const NA_ERROR = new FormulaError('#N/A');
export const NUM_ERROR = new FormulaError('#NUM!');
export const SPILL_ERROR = new FormulaError('#SPILL!');

export function isFormulaError(v: unknown): v is FormulaError {
  return v instanceof FormulaError;
}
