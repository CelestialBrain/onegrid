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
    // `@operand` — implicit-intersection operator (wave 17). Binds tighter
    // than binary operators but looser than postfix.
    if (this.peek('at')) {
      this.consume();
      const operand = this.parseUnary();
      return { kind: 'implicitIntersection', operand };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): FormulaNode {
    let node = this.parsePrimary();
    while (true) {
      if (this.peek('percent')) {
        this.consume();
        node = { kind: 'percent', operand: node };
        continue;
      }
      // `A1#` — spilled-range operator (wave 17). Only valid against a
      // single-cell ref; anything else falls back to #NAME?-at-eval-time
      // via a `call` node so the parser stays permissive.
      if (this.peek('hash') && node.kind === 'cellRef') {
        this.consume();
        node = { kind: 'spilledRef', anchor: node.ref };
        continue;
      }
      break;
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
      case 'tableRef': {
        this.pos++;
        return parseTableRefText(tok.value as string, tok.start);
      }
      case 'lparen': {
        this.pos++;
        const expr = this.parseExpression();
        this.expect('rparen');
        return expr;
      }
      case 'identifier': {
        // Preserve original casing — `getFunction` looks up
        // case-insensitively, but bare-identifier paths (LET bindings,
        // named ranges, etc.) need the user's exact identifier.
        const name = tok.value as string;
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
        // names; named ranges via `getNamedRange`; everything else
        // degenerates to #NAME? at evaluation time.
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

// ----- Structured table-ref text parsing (wave 18) --------------------------
//
// Excel grammar for `Table[...]`:
//   Table1[Column]                  → data column
//   Table1[[Column]]                → same (single column in brackets)
//   Table1[@Column]                 → this-row of column
//   Table1[#Headers]                → headers row only (single column not named)
//   Table1[#Totals]                 → totals row only
//   Table1[#All]                    → entire table including headers + totals
//   Table1[#Data]                   → data rows only (default)
//   Table1[[#Headers],[Column]]     → headers row of that column
//   Table1[[#All],[Column]]         → entire column including header + totals
//   Table1[[#This Row],[Column]]    → same as Table1[@Column]
//
// The tokenizer already captured the whole `Identifier[...]` as one token;
// here we split off `table` and parse the bracket body. We accept the
// shapes above and emit a TableRefNode with the resolved `selector` + the
// optional `column`. Unknown shapes throw FormulaSyntaxError.

function parseTableRefText(text: string, start: number): FormulaNode {
  const open = text.indexOf('[');
  if (open < 0) throw new FormulaSyntaxError(`malformed table ref "${text}"`, start);
  const table = text.slice(0, open);
  const body = text.slice(open + 1, -1).trim(); // strip outer []
  if (!body) {
    // `Table1[]` — full data range, no column.
    return { kind: 'tableRef', table, selector: 'data' };
  }
  // `@Column` shorthand for `[#This Row],[Column]`.
  if (body.startsWith('@')) {
    return { kind: 'tableRef', table, selector: 'thisRow', column: body.slice(1).trim() };
  }
  // Region keyword without column: `[#Headers]` / `[#Totals]` / etc.
  if (body.startsWith('#')) {
    return { kind: 'tableRef', table, selector: regionKeyword(body, text, start) };
  }
  // Compound `[#Region],[Column]`. Split top-level commas (none nested
  // here since brackets are balanced by the tokenizer).
  const parts = splitTopLevelCommas(body).map((p) => p.trim());
  if (parts.length === 2) {
    const a = parts[0]!;
    const b = parts[1]!;
    const selector = regionKeyword(stripBrackets(a), text, start);
    const column = stripBrackets(b);
    return { kind: 'tableRef', table, selector, column };
  }
  // Single bracketed segment `[Column]` or bare `Column`.
  const single = stripBrackets(parts[0]!);
  if (single.startsWith('#')) {
    return { kind: 'tableRef', table, selector: regionKeyword(single, text, start) };
  }
  return { kind: 'tableRef', table, selector: 'data', column: single };
}

function regionKeyword(
  raw: string,
  source: string,
  start: number,
): 'all' | 'headers' | 'data' | 'totals' | 'thisRow' {
  const k = raw.trim().toLowerCase();
  if (k === '#all') return 'all';
  if (k === '#headers') return 'headers';
  if (k === '#data') return 'data';
  if (k === '#totals') return 'totals';
  if (k === '#this row' || k === '#thisrow') return 'thisRow';
  throw new FormulaSyntaxError(`unknown table region "${raw}" in ${source}`, start);
}

function stripBrackets(s: string): string {
  const t = s.trim();
  if (t.startsWith('[') && t.endsWith(']')) return t.slice(1, -1).trim();
  return t;
}

function splitTopLevelCommas(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of s) {
    if (ch === '[') depth++;
    else if (ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      out.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf) out.push(buf);
  return out;
}
