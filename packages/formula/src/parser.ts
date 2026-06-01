// =============================================================================
// Parser
//
// Recursive-descent, Excel-compatible operator precedence:
//
//   comparison  =, <>, <, <=, >, >=         (lowest)
//   concat      &
//   additive    +, -
//   multiply    *, /
//   exponent    ^
//   unary       +, -                        (right-associative)
//   postfix     %                           (highest)
//   primary     literal | ref | range | func(...) | (expr)
//
// =============================================================================

import { FormulaSyntaxError, tokenize, type Token, type TokenType } from './tokenizer';
import type { BinaryOp, FormulaNode } from './ast';

export function parseFormula(input: string): FormulaNode {
  const tokens = tokenize(input);
  const parser = new Parser(tokens);
  const node = parser.parseExpression();
  parser.expect('eof');
  return node;
}

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  parseExpression(): FormulaNode {
    return this.parseComparison();
  }

  private parseComparison(): FormulaNode {
    let left = this.parseConcat();
    while (
      this.peek('eq') ||
      this.peek('neq') ||
      this.peek('lt') ||
      this.peek('lte') ||
      this.peek('gt') ||
      this.peek('gte')
    ) {
      const op = this.consume().type;
      const right = this.parseConcat();
      left = {
        kind: 'binary',
        op: comparisonOpToString(op),
        left,
        right,
      };
    }
    return left;
  }

  private parseConcat(): FormulaNode {
    let left = this.parseAdditive();
    while (this.peek('concat')) {
      this.consume();
      const right = this.parseAdditive();
      left = { kind: 'binary', op: '&', left, right };
    }
    return left;
  }

  private parseAdditive(): FormulaNode {
    let left = this.parseMultiplicative();
    while (this.peek('plus') || this.peek('minus')) {
      const op = this.consume().type === 'plus' ? '+' : '-';
      const right = this.parseMultiplicative();
      left = { kind: 'binary', op, left, right };
    }
    return left;
  }

  private parseMultiplicative(): FormulaNode {
    let left = this.parseExponent();
    while (this.peek('star') || this.peek('slash')) {
      const op = this.consume().type === 'star' ? '*' : '/';
      const right = this.parseExponent();
      left = { kind: 'binary', op, left, right };
    }
    return left;
  }

  private parseExponent(): FormulaNode {
    const base = this.parseUnary();
    if (this.peek('caret')) {
      this.consume();
      // ^ is right-associative
      const exponent = this.parseExponent();
      return { kind: 'binary', op: '^', left: base, right: exponent };
    }
    return base;
  }

  private parseUnary(): FormulaNode {
    if (this.peek('plus') || this.peek('minus')) {
      const op = this.consume().type === 'plus' ? '+' : '-';
      const operand = this.parseUnary();
      return { kind: 'unary', op, operand };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): FormulaNode {
    let node = this.parsePrimary();
    while (this.peek('percent')) {
      this.consume();
      node = { kind: 'percent', operand: node };
    }
    return node;
  }

  private parsePrimary(): FormulaNode {
    const tok = this.peekToken();
    if (!tok) throw new FormulaSyntaxError('unexpected end of input', 0);

    switch (tok.type) {
      case 'number':
        this.pos++;
        return { kind: 'number', value: tok.value as number };
      case 'string':
        this.pos++;
        return { kind: 'string', value: tok.value as string };
      case 'boolean':
        this.pos++;
        return { kind: 'boolean', value: tok.value as boolean };
      case 'cellRef':
        this.pos++;
        return { kind: 'cellRef', ref: tok.value as string };
      case 'rangeRef':
        this.pos++;
        return { kind: 'rangeRef', ref: tok.value as string };
      case 'lparen': {
        this.pos++;
        const expr = this.parseExpression();
        this.expect('rparen');
        return expr;
      }
      case 'identifier': {
        const name = (tok.value as string).toUpperCase();
        this.pos++;
        if (this.peek('lparen')) {
          this.pos++;
          const args: FormulaNode[] = [];
          if (!this.peek('rparen')) {
            args.push(this.parseExpression());
            while (this.peek('comma')) {
              this.pos++;
              args.push(this.parseExpression());
            }
          }
          this.expect('rparen');
          return { kind: 'call', name, args };
        }
        // Bare identifier (no parens). Surface as a zero-arg call node so
        // the evaluator can resolve it: LET / LAMBDA bindings see these as
        // names; everything else degenerates to #NAME? at evaluation time.
        return { kind: 'call', name, args: [] };
      }
      default:
        throw new FormulaSyntaxError(`unexpected token "${tok.text}"`, tok.start);
    }
  }

  private peek(type: TokenType): boolean {
    return this.tokens[this.pos]?.type === type;
  }

  private peekToken(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(): Token {
    const t = this.tokens[this.pos];
    if (!t) throw new FormulaSyntaxError('unexpected end of input', 0);
    this.pos++;
    return t;
  }

  expect(type: TokenType): Token {
    const t = this.tokens[this.pos];
    if (!t || t.type !== type) {
      throw new FormulaSyntaxError(
        `expected ${type} but got ${t?.type ?? 'end of input'}`,
        t?.start ?? 0,
      );
    }
    this.pos++;
    return t;
  }
}

function comparisonOpToString(t: TokenType): BinaryOp {
  switch (t) {
    case 'eq':
      return '=';
    case 'neq':
      return '<>';
    case 'lt':
      return '<';
    case 'lte':
      return '<=';
    case 'gt':
      return '>';
    case 'gte':
      return '>=';
    default:
      return '=';
  }
}
