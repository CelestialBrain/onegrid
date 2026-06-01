// =============================================================================
// AST → OOXML formula-text serializer.
//
// Walks a @onegrid/formula AST and produces the exact textual form OOXML
// expects inside `<f>…</f>`. We omit the leading "=" (OOXML formula tags
// don't carry it) and minimize the parenthesization to what's necessary
// for the grammar.
// =============================================================================

import type { FormulaNode } from '@onegrid/formula';

// Excel precedence ladder — higher number binds tighter. Drives the
// parenthesize-on-write decision so we don't emit `1+(2*3)` when `1+2*3`
// already reflects the AST shape.
const BIN_PRECEDENCE: Record<string, number> = {
  '<': 1, '<=': 1, '>': 1, '>=': 1, '=': 1, '<>': 1,
  '&': 2,
  '+': 3, '-': 3,
  '*': 4, '/': 4,
  '^': 5,
};

function precedenceOf(node: FormulaNode): number {
  if (node.kind === 'binary') return BIN_PRECEDENCE[node.op] ?? 0;
  return 100; // atoms / calls bind tightest
}

function paren(inner: string, needsParen: boolean): string {
  return needsParen ? `(${inner})` : inner;
}

export function serializeFormula(node: FormulaNode): string {
  switch (node.kind) {
    case 'number':
      return String(node.value);
    case 'string':
      return `"${node.value.replace(/"/g, '""')}"`;
    case 'boolean':
      return node.value ? 'TRUE' : 'FALSE';
    case 'cellRef':
    case 'rangeRef':
      return node.ref;
    case 'percent':
      return `${serializeFormula(node.operand)}%`;
    case 'unary':
      return `${node.op}${serializeFormula(node.operand)}`;
    case 'binary': {
      const self = BIN_PRECEDENCE[node.op] ?? 0;
      const leftStr = paren(serializeFormula(node.left), precedenceOf(node.left) < self);
      // Right-associative for ^; left-associative everywhere else.
      const rightThreshold = node.op === '^' ? self : self + 1;
      const rightStr = paren(serializeFormula(node.right), precedenceOf(node.right) < rightThreshold);
      return `${leftStr}${node.op}${rightStr}`;
    }
    case 'call':
      return `${node.name.toUpperCase()}(${node.args.map(serializeFormula).join(',')})`;
  }
}
