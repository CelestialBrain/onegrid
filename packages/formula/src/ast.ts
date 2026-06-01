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
  | PercentNode
  | LambdaNode
  | SpilledRefNode
  | ImplicitIntersectionNode;

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

/**
 * `LAMBDA(p1, p2, ..., body)` — a first-class function value. Construction-
 * time only stores the parameter names + body AST; the captured scope
 * (resolver and any LET bindings active at construction time) is attached
 * by the evaluator when the lambda is constructed, so the closure can fire
 * later from inside BYROW / MAP / REDUCE without losing its lexical
 * context.
 */
export interface LambdaNode {
  readonly kind: 'lambda';
  readonly params: ReadonlyArray<string>;
  readonly body: FormulaNode;
}

/**
 * `A1#` — read the dynamic-array spill range anchored at A1. Resolves to a
 * 2D array (or `#REF!` if A1 isn't a spill anchor). The anchor ref is
 * preserved exactly as written.
 */
export interface SpilledRefNode {
  readonly kind: 'spilledRef';
  readonly anchor: string;
}

/**
 * `@A1:A10` — implicit-intersection operator. Collapses a range or
 * spilled array to the value in the row of the calling cell. The
 * evaluator needs the caller's row, which it reads from the CallContext
 * sidechannel (via `setCalleeAnchor`). If the anchor isn't known, the
 * operator falls back to the first element (Excel's documented degradation
 * for non-anchored contexts).
 */
export interface ImplicitIntersectionNode {
  readonly kind: 'implicitIntersection';
  readonly operand: FormulaNode;
}
