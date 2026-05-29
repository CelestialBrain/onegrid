// =============================================================================
// @onegrid/formula — parser/tokenizer fuzz harness.
//
// SECURITY.md identifies formula evaluation as a defended boundary. Two
// failure modes are unacceptable for an adopter who pipes user-typed
// expressions into the engine:
//
//   1. The parser crashes with a TypeError, RangeError, or thrown
//      string — anything other than `FormulaSyntaxError`. That escapes
//      the host's error-handling channel and may surface as a 500.
//   2. The tokenizer infinite-loops or allocates unboundedly.
//
// This spec drives `tokenize` + `parseFormula` with arbitrary string
// inputs (random Unicode, structured fragments like quotes / parens /
// operators / cell refs) and asserts each either succeeds OR throws a
// `FormulaSyntaxError`. Anything else fails the test.
// =============================================================================

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parseFormula } from '../parser';
import { tokenize, FormulaSyntaxError } from '../tokenizer';

// CI fuzz pass uses ONEGRID_FUZZ_RUNS to bump iteration count. Defaults are
// modest so local `pnpm test` stays snappy.
const NUM_RUNS = Number.parseInt(process.env.ONEGRID_FUZZ_RUNS ?? '500', 10);

function isExpectedThrow(err: unknown): boolean {
  return err instanceof FormulaSyntaxError;
}

// Arbitrary that biases toward formula-like fragments — characters that
// actually exercise the parser's edge cases (quotes, parens, operators,
// numerics, whitespace) rather than purely random Unicode that always
// fails at the first token.
const formulaCharArb = fc.oneof(
  fc.constantFrom('=', '+', '-', '*', '/', '(', ')', ',', '$', '"', "'", ' ', '\t', '\n'),
  fc.constantFrom('A', 'B', 'C', 'Z', '1', '0', '9'),
  fc.constantFrom(':', ';', '!', '@', '#', '<', '>', '%', '&', '|', '^', '~'),
  fc.string({ minLength: 1, maxLength: 1 }),
);

const formulaArb = fc.array(formulaCharArb, { minLength: 0, maxLength: 64 }).map((cs) => cs.join(''));

describe('@onegrid/formula — parser/tokenizer fuzz', () => {
  it('tokenize never crashes uncontrollably on arbitrary input', () => {
    fc.assert(
      fc.property(formulaArb, (s) => {
        try {
          tokenize(s);
          return true;
        } catch (err) {
          if (isExpectedThrow(err)) return true;
          // Tokenizer may throw FormulaSyntaxError, but anything else is a bug.
          throw err;
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('parseFormula never crashes uncontrollably on arbitrary input', () => {
    fc.assert(
      fc.property(formulaArb, (s) => {
        try {
          parseFormula(s);
          return true;
        } catch (err) {
          if (isExpectedThrow(err)) return true;
          throw err;
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('valid arithmetic expressions always parse successfully', () => {
    // Constructive arbitrary: only well-formed numeric + arithmetic.
    const num = fc.integer({ min: 0, max: 999 }).map((n) => String(n));
    const op = fc.constantFrom('+', '-', '*', '/');
    const expr = fc
      .tuple(num, op, num, op, num)
      .map(([a, o1, b, o2, c]) => `${a} ${o1} ${b} ${o2} ${c}`);

    fc.assert(
      fc.property(expr, (s) => {
        const ast = parseFormula(s);
        expect(ast).toBeDefined();
        return true;
      }),
      { numRuns: Math.min(NUM_RUNS, 100) },
    );
  });
});
