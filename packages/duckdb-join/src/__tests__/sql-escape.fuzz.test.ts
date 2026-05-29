// =============================================================================
// @onegrid/duckdb-join — sql-escape fuzz harness.
//
// The cross-source composition path interpolates user-supplied source
// names into DuckDB CREATE VIEW DDL. The defense is `escapeIdent` (which
// must double every `"` so wrapping in `"..."` is safe) and `sqlLiteral`
// (which must produce a SQL fragment with no unescaped single-quote
// outside the wrapping pair).
//
// Both are total functions over their input domain; this spec drives
// arbitrary strings + arbitrary JS values through them and asserts the
// invariants directly.
// =============================================================================

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { escapeIdent, sqlLiteral } from '../sql-escape';

const NUM_RUNS = Number.parseInt(process.env.ONEGRID_FUZZ_RUNS ?? '500', 10);

describe('@onegrid/duckdb-join — sql-escape fuzz', () => {
  it('escapeIdent doubles every double-quote', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 128 }), (s) => {
        const escaped = escapeIdent(s);
        // For each `"` in input, the output has exactly two `"`.
        const inputQuotes = (s.match(/"/g) ?? []).length;
        const outputQuotes = (escaped.match(/"/g) ?? []).length;
        expect(outputQuotes).toBe(inputQuotes * 2);
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('escapeIdent + wrapping in double-quotes makes the identifier balanced', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 128 }), (s) => {
        const wrapped = `"${escapeIdent(s)}"`;
        // The wrapper produces a string of the form: " ... "
        // with an EVEN number of internal "s between the outer pair.
        const internal = wrapped.slice(1, -1);
        const quoteCount = (internal.match(/"/g) ?? []).length;
        expect(quoteCount % 2).toBe(0);
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('sqlLiteral never returns a string with an unescaped apostrophe in the body', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(null),
          fc.boolean(),
          fc.integer(),
          fc.double({ noNaN: true }),
          fc.string({ minLength: 0, maxLength: 64 }),
        ),
        (v) => {
          const out = sqlLiteral(v);
          // For string outputs, the body between the outer quotes must
          // have an even number of single-quotes (every `'` doubled).
          if (out.startsWith("'") && out.endsWith("'")) {
            const body = out.slice(1, -1);
            const apostrophes = (body.match(/'/g) ?? []).length;
            expect(apostrophes % 2).toBe(0);
          }
          // NULL / TRUE / FALSE / numerics are unquoted and must not
          // contain ANY apostrophes.
          if (!out.startsWith("'") && !out.startsWith('TIMESTAMP')) {
            expect(out.includes("'")).toBe(false);
          }
          return true;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('sqlLiteral coerces non-finite numbers to NULL (no Infinity/NaN leakage)', () => {
    fc.assert(
      fc.property(fc.constantFrom(Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, NaN), (n) => {
        expect(sqlLiteral(n)).toBe('NULL');
        return true;
      }),
      { numRuns: 10 },
    );
  });
});
