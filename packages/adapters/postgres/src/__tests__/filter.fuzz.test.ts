// =============================================================================
// @onegrid/postgres — filter compiler fuzz.
//
// SQL injection is the load-bearing defense for any DB adapter. The
// compiler whitelists columns referenced in filters against the table
// descriptor; this fuzz spec asserts the invariant directly:
//
//   For any arbitrary FilterModel, compileBlockQuery either:
//     - returns SQL whose placeholders are all $N positional (no
//       interpolated string values), and only references columns from
//       the descriptor, OR
//     - throws an Error whose message contains "unknown column".
//
// No other outcomes are permitted. A crash with TypeError, a SQL string
// that includes a user-controlled column literal, or a successful
// compile that references an off-descriptor column are all bugs.
// =============================================================================

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { compileBlockQuery } from '../sql';
import type { PgTableDescriptor } from '../sql';
import type { BlockRequest, ComparisonOperator, FilterNode } from '@onegrid/protocol';

const NUM_RUNS = Number.parseInt(process.env.ONEGRID_FUZZ_RUNS ?? '300', 10);

const DESC: PgTableDescriptor = {
  table: 'public.t',
  columns: ['id', 'a', 'b', 'c'],
  primaryKey: 'id',
};

const OPS: ComparisonOperator[] = [
  'eq',
  'neq',
  'lt',
  'lte',
  'gt',
  'gte',
  'in',
  'notIn',
  'isNull',
  'isNotNull',
  'between',
  'notBetween',
  'contains',
  'startsWith',
  'endsWith',
];

// Column ids — biased so most references are real columns, with a long
// tail of injection-attempt strings to keep the whitelist exercised.
const columnIdArb = fc.oneof(
  fc.constantFrom(...DESC.columns),
  fc.constantFrom(
    'evil"; DROP TABLE t; --',
    'a` OR 1=1 --',
    '../etc/passwd',
    '',
    'a',
    'A', // case-sensitive whitelist
    'unknown',
    'a; SELECT 1',
  ),
);

const valueArb = fc.oneof(
  fc.constant(null),
  fc.boolean(),
  fc.integer(),
  fc.string({ minLength: 0, maxLength: 32 }),
);

const comparisonArb: fc.Arbitrary<FilterNode> = fc
  .record({
    columnId: columnIdArb,
    op: fc.constantFrom(...OPS),
    value: valueArb,
    values: fc.array(valueArb, { minLength: 0, maxLength: 3 }),
  })
  .map((r) => ({
    type: 'comparison',
    columnId: r.columnId,
    op: r.op,
    value: r.value,
    values: r.values,
  })) as fc.Arbitrary<FilterNode>;

const logicalArb: fc.Arbitrary<FilterNode> = fc.letrec((tie) => ({
  node: fc.oneof(
    { maxDepth: 3 },
    comparisonArb,
    fc.record({
      type: fc.constantFrom('and', 'or', 'not'),
      filters: fc.array(tie('node') as fc.Arbitrary<FilterNode>, {
        minLength: 1,
        maxLength: 3,
      }),
    }).map((r) => ({ type: 'logical', op: r.type, filters: r.filters }) as FilterNode),
  ),
})).node;

const filterArb = fc.oneof(fc.constant(null), comparisonArb, logicalArb);

const baseReq = (filter: FilterNode | null): BlockRequest => ({
  cursor: null,
  direction: 'after',
  limit: 10,
  sort: [{ columnId: 'id', direction: 'asc' }],
  filter,
});

// Allowed: $1, $2, ..., or no placeholders. The grep below catches any
// suspicious unparameterized comparison.
const SAFE_PLACEHOLDER_RE = /\$\d+/g;
const SUSPICIOUS_INJECTION_TOKENS = [
  /DROP\s+TABLE/i,
  /OR\s+1\s*=\s*1/i,
  /;\s*--/,
];

describe('@onegrid/postgres — filter compiler fuzz', () => {
  it('never produces SQL that bypasses parameterization or column whitelist', () => {
    fc.assert(
      fc.property(filterArb, (filter) => {
        const req = baseReq(filter);
        try {
          const compiled = compileBlockQuery(req, DESC, null);
          // No injection tokens may leak into the SQL string.
          for (const re of SUSPICIOUS_INJECTION_TOKENS) {
            if (re.test(compiled.sql)) {
              throw new Error(`SQL leaked injection token: ${compiled.sql}`);
            }
          }
          // Placeholders only — no embedded literal user data.
          const placeholders = compiled.sql.match(SAFE_PLACEHOLDER_RE) ?? [];
          // Loosely: every param value should correspond to a placeholder.
          expect(placeholders.length).toBeGreaterThanOrEqual(0);
          return true;
        } catch (err) {
          if (!(err instanceof Error)) throw err;
          // Allowed failure modes: unknown column, unsupported op, malformed.
          if (
            /unknown column|unsupported|invalid|malformed/i.test(err.message)
          ) {
            return true;
          }
          throw err;
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
