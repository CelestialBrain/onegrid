// =============================================================================
// Formula AST
//
// Plain TypeScript discriminated unions. The evaluator visits these nodes;
// the parser produces them.
// =============================================================================

export type FormulaNode =
  | NumberLiteral
  | StringLiteral
  | BooleanLiteral
  | CellRefNode
  | RangeRefNode
  | UnaryOpNode
  | BinaryOpNode
  | FunctionCallNode
  | PercentNode;

export interface NumberLiteral {
  readonly kind: 'number';
  readonly value: number;
}

export interface StringLiteral {
  readonly kind: 'string';
  readonly value: string;
}

export interface BooleanLiteral {
  readonly kind: 'boolean';
  readonly value: boolean;
}

export interface CellRefNode {
  readonly kind: 'cellRef';
  /** Original text, e.g. "A1" or "$B$2". */
  readonly ref: string;
}

export interface RangeRefNode {
  readonly kind: 'rangeRef';
  /** Original text, e.g. "A1:B10". */
  readonly ref: string;
}

export type BinaryOp =
  | '+'
  | '-'
  | '*'
  | '/'
  | '^'
  | '&'
  | '='
  | '<>'
  | '<'
  | '<='
  | '>'
  | '>=';

export interface UnaryOpNode {
  readonly kind: 'unary';
  readonly op: '+' | '-';
  readonly operand: FormulaNode;
}

export interface BinaryOpNode {
  readonly kind: 'binary';
  readonly op: BinaryOp;
  readonly left: FormulaNode;
  readonly right: FormulaNode;
}

export interface FunctionCallNode {
  readonly kind: 'call';
  readonly name: string;
  readonly args: ReadonlyArray<FormulaNode>;
}

export interface PercentNode {
  readonly kind: 'percent';
  readonly operand: FormulaNode;
}
