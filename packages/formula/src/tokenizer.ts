// =============================================================================
// Tokenizer
//
// Converts a formula string into a stream of tokens for the parser. Excel-
// compatible surface syntax: cell refs (A1, $A$1), range refs (A1:B10),
// numbers (with decimal + exponent), strings (double-quoted with "" escape),
// booleans (TRUE/FALSE), arithmetic operators, comparison operators,
// percent suffix, function names, and parentheses + commas.
// =============================================================================

export type TokenType =
  | 'number'
  | 'string'
  | 'boolean'
  | 'cellRef'
  | 'rangeRef'
  | 'identifier'
  | 'lparen'
  | 'rparen'
  | 'comma'
  | 'plus'
  | 'minus'
  | 'star'
  | 'slash'
  | 'caret'
  | 'percent'
  | 'eq'
  | 'neq'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'concat'
  | 'eof';

export interface Token {
  readonly type: TokenType;
  readonly text: string;
  readonly value?: number | string | boolean;
  /** 0-based column offset of the token's start. */
  readonly start: number;
}

export class FormulaSyntaxError extends Error {
  constructor(
    message: string,
    public readonly position: number,
  ) {
    super(`${message} at position ${String(position)}`);
    this.name = 'FormulaSyntaxError';
  }
}

const SINGLE_CHAR_TOKENS: Record<string, TokenType> = {
  '(': 'lparen',
  ')': 'rparen',
  ',': 'comma',
  '+': 'plus',
  '-': 'minus',
  '*': 'star',
  '/': 'slash',
  '^': 'caret',
  '%': 'percent',
  '&': 'concat',
};

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  // Skip a leading "=" — Excel-style formulas usually start with one.
  if (input.startsWith('=')) i = 1;
  const len = input.length;

  while (i < len) {
    const ch = input[i]!;

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Multi-char comparison operators.
    if (ch === '<') {
      if (input[i + 1] === '=') {
        tokens.push({ type: 'lte', text: '<=', start: i });
        i += 2;
        continue;
      }
      if (input[i + 1] === '>') {
        tokens.push({ type: 'neq', text: '<>', start: i });
        i += 2;
        continue;
      }
      tokens.push({ type: 'lt', text: '<', start: i });
      i++;
      continue;
    }
    if (ch === '>') {
      if (input[i + 1] === '=') {
        tokens.push({ type: 'gte', text: '>=', start: i });
        i += 2;
        continue;
      }
      tokens.push({ type: 'gt', text: '>', start: i });
      i++;
      continue;
    }
    if (ch === '=') {
      tokens.push({ type: 'eq', text: '=', start: i });
      i++;
      continue;
    }

    if (ch in SINGLE_CHAR_TOKENS) {
      tokens.push({ type: SINGLE_CHAR_TOKENS[ch]!, text: ch, start: i });
      i++;
      continue;
    }

    if (ch === '"') {
      const start = i;
      i++;
      let str = '';
      while (i < len) {
        const c = input[i]!;
        if (c === '"') {
          if (input[i + 1] === '"') {
            str += '"';
            i += 2;
            continue;
          }
          i++;
          tokens.push({ type: 'string', text: input.slice(start, i), value: str, start });
          break;
        }
        str += c;
        i++;
      }
      if (i > len) throw new FormulaSyntaxError('unterminated string', start);
      continue;
    }

    if (/[0-9.]/.test(ch)) {
      const start = i;
      let s = '';
      while (i < len && /[0-9]/.test(input[i]!)) {
        s += input[i];
        i++;
      }
      if (input[i] === '.') {
        s += '.';
        i++;
        while (i < len && /[0-9]/.test(input[i]!)) {
          s += input[i];
          i++;
        }
      }
      if (input[i] === 'e' || input[i] === 'E') {
        s += input[i];
        i++;
        if (input[i] === '+' || input[i] === '-') {
          s += input[i];
          i++;
        }
        while (i < len && /[0-9]/.test(input[i]!)) {
          s += input[i];
          i++;
        }
      }
      const n = Number(s);
      if (Number.isNaN(n)) throw new FormulaSyntaxError(`invalid number "${s}"`, start);
      tokens.push({ type: 'number', text: s, value: n, start });
      continue;
    }

    if (/[A-Za-z_$]/.test(ch)) {
      const start = i;
      let s = '';
      while (i < len && /[A-Za-z0-9_$.]/.test(input[i]!)) {
        s += input[i];
        i++;
      }
      const upper = s.toUpperCase();
      if (upper === 'TRUE' || upper === 'FALSE') {
        tokens.push({
          type: 'boolean',
          text: s,
          value: upper === 'TRUE',
          start,
        });
        continue;
      }

      // Cell ref: optional $, letters, optional $, digits.
      const cellMatch = /^[$]?[A-Za-z]+[$]?[0-9]+$/.exec(s);
      if (cellMatch) {
        // Check for range: peek for ':'
        if (input[i] === ':') {
          let j = i + 1;
          let other = '';
          while (j < len && /[A-Za-z0-9_$.]/.test(input[j]!)) {
            other += input[j];
            j++;
          }
          if (/^[$]?[A-Za-z]+[$]?[0-9]+$/.test(other)) {
            tokens.push({
              type: 'rangeRef',
              text: input.slice(start, j),
              value: input.slice(start, j),
              start,
            });
            i = j;
            continue;
          }
        }
        tokens.push({ type: 'cellRef', text: s, value: s, start });
        continue;
      }

      // Whole-column range: identifier is letters-only ($A or A) and the
      // next char is `:` followed by another letters-only sequence.
      // Examples: A:A, A:Z, $A:$A. Engine treats these as columns extending
      // from row 1 to a configurable maxRow (default 1000).
      if (/^[$]?[A-Za-z]+$/.test(s) && input[i] === ':') {
        let j = i + 1;
        let endLetters = '';
        while (j < len && /[A-Za-z$]/.test(input[j]!)) {
          endLetters += input[j];
          j++;
        }
        if (endLetters && /^[$]?[A-Za-z]+$/.test(endLetters)) {
          tokens.push({
            type: 'rangeRef',
            text: input.slice(start, j),
            value: input.slice(start, j),
            start,
          });
          i = j;
          continue;
        }
      }

      // Otherwise: function name / identifier.
      tokens.push({ type: 'identifier', text: s, value: s, start });
      continue;
    }

    throw new FormulaSyntaxError(`unexpected character "${ch}"`, i);
  }

  tokens.push({ type: 'eof', text: '', start: i });
  return tokens;
}
