// =============================================================================
// SQL compiler — unit tests.
//
// Exercises the BlockRequest → parameterized SQL translation in
// isolation. No Postgres instance required; we assert on the
// `{ sql, params }` shape directly. Integration tests against a
// real database are a v0.0.9 follow-up (require a containerized
// pg instance in CI).
// =============================================================================

import { describe, expect, it } from 'vitest';
import type { BlockRequest } from '@onegrid/protocol';
import {
  compileBlockQuery,
  decodeKeysetCursor,
  encodeKeysetCursor,
  type PgTableDescriptor,
} from '../sql';

const TABLE: PgTableDescriptor = {
  table: 'public.orders',
  columns: ['id', 'status', 'amount', 'customer'],
  primaryKey: 'id',
};

function req(overrides: Partial<BlockRequest> = {}): BlockRequest {
  return {
    cursor: null,
    direction: 'after',
    limit: 100,
    sort: [],
    filter: null,
    ...overrides,
  };
}

describe('compileBlockQuery — flat path', () => {
  it('selects every column when projection is omitted', () => {
    const { sql, params } = compileBlockQuery(req(), TABLE, null);
    expect(sql).toContain('"id", "status", "amount", "customer"');
    expect(sql).toContain('FROM "public"."orders"');
    expect(sql).toContain('ORDER BY "id" ASC');
    expect(sql).toContain('LIMIT $1');
    expect(params).toEqual([100]);
  });

  it('honors an explicit column projection', () => {
    const { sql } = compileBlockQuery(
      req({ columns: ['id', 'status'] }),
      TABLE,
      null,
    );
    expect(sql).toContain('SELECT "id", "status" FROM');
  });

  it('rejects columns not in the descriptor', () => {
    expect(() =>
      compileBlockQuery(req({ columns: ['secret'] }), TABLE, null),
    ).toThrow(/unknown column "secret"/);
  });

  it('translates a single comparison filter into a parameterized WHERE', () => {
    const { sql, params } = compileBlockQuery(
      req({
        filter: {
          type: 'comparison',
          columnId: 'status',
          op: 'eq',
          value: 'active',
        },
      }),
      TABLE,
      null,
    );
    expect(sql).toContain('WHERE "status" = $1');
    expect(params).toEqual(['active', 100]);
  });

  it('translates IN/NOT IN with placeholder lists', () => {
    const { sql, params } = compileBlockQuery(
      req({
        filter: {
          type: 'comparison',
          columnId: 'status',
          op: 'in',
          values: ['active', 'pending', 'pilot'],
        },
      }),
      TABLE,
      null,
    );
    expect(sql).toContain('"status" IN ($1, $2, $3)');
    expect(params).toEqual(['active', 'pending', 'pilot', 100]);
  });

  it('escapes LIKE-special characters on contains', () => {
    const { sql, params } = compileBlockQuery(
      req({
        filter: {
          type: 'comparison',
          columnId: 'customer',
          op: 'contains',
          value: 'A%c_o',
        },
      }),
      TABLE,
      null,
    );
    expect(sql).toContain('LIKE');
    expect(params[0]).toBe('%A\\%c\\_o%');
  });

  it('isNull / isNotNull need no params', () => {
    const a = compileBlockQuery(
      req({
        filter: {
          type: 'comparison',
          columnId: 'amount',
          op: 'isNull',
        },
      }),
      TABLE,
      null,
    );
    expect(a.sql).toContain('"amount" IS NULL');
    expect(a.params).toEqual([100]);
    const b = compileBlockQuery(
      req({
        filter: {
          type: 'comparison',
          columnId: 'amount',
          op: 'isNotNull',
        },
      }),
      TABLE,
      null,
    );
    expect(b.sql).toContain('"amount" IS NOT NULL');
  });

  it('between expands to two placeholders', () => {
    const { sql, params } = compileBlockQuery(
      req({
        filter: {
          type: 'comparison',
          columnId: 'amount',
          op: 'between',
          values: [10, 100],
        },
      }),
      TABLE,
      null,
    );
    expect(sql).toContain('"amount" BETWEEN $1 AND $2');
    expect(params).toEqual([10, 100, 100]);
  });

  it('compiles nested logical AND/OR/NOT', () => {
    const { sql, params } = compileBlockQuery(
      req({
        filter: {
          type: 'logical',
          op: 'and',
          filters: [
            { type: 'comparison', columnId: 'status', op: 'eq', value: 'active' },
            {
              type: 'logical',
              op: 'or',
              filters: [
                { type: 'comparison', columnId: 'amount', op: 'gt', value: 100 },
                {
                  type: 'logical',
                  op: 'not',
                  filters: [
                    { type: 'comparison', columnId: 'customer', op: 'eq', value: 'x' },
                  ],
                },
              ],
            },
          ],
        },
      }),
      TABLE,
      null,
    );
    expect(sql).toContain(
      'WHERE ("status" = $1 AND ("amount" > $2 OR (NOT "customer" = $3)))',
    );
    expect(params).toEqual(['active', 100, 'x', 100]);
  });

  it('compiles ORDER BY with NULLS handling and primary-key tiebreaker', () => {
    const { sql } = compileBlockQuery(
      req({
        sort: [
          { columnId: 'amount', direction: 'desc', nulls: 'first' },
          { columnId: 'status', direction: 'asc' },
        ],
      }),
      TABLE,
      null,
    );
    expect(sql).toContain(
      'ORDER BY "amount" DESC NULLS FIRST, "status" ASC NULLS LAST, "id" ASC',
    );
  });

  it('keyset cursor compiles to a row-comparison predicate', () => {
    const cursor = decodeKeysetCursor(
      encodeKeysetCursor({ sortValues: ['active', 50], rowId: 42 }),
    );
    const { sql, params } = compileBlockQuery(
      req({
        sort: [
          { columnId: 'status', direction: 'asc' },
          { columnId: 'amount', direction: 'asc' },
        ],
      }),
      TABLE,
      cursor,
    );
    expect(sql).toContain(
      '("status", "amount", "id") > ($1, $2, $3)',
    );
    expect(params).toEqual(['active', 50, 42, 100]);
  });

  it('descending keyset uses < instead of >', () => {
    const cursor = decodeKeysetCursor(
      encodeKeysetCursor({ sortValues: ['z'], rowId: 99 }),
    );
    const { sql } = compileBlockQuery(
      req({
        sort: [{ columnId: 'status', direction: 'desc' }],
      }),
      TABLE,
      cursor,
    );
    expect(sql).toContain('< ');
    expect(sql).toContain('"id" DESC'); // tiebreaker flips with direction
  });
});

describe('compileBlockQuery — grouped path', () => {
  it('emits GROUP BY with COUNT(*) and aggregation aliases', () => {
    const { sql } = compileBlockQuery(
      req({
        grouping: { columns: ['status'], openKeys: [] },
        aggregations: [
          { columnId: 'amount', fn: 'sum' },
          { columnId: 'amount', fn: 'avg', alias: 'avg_amount' },
        ],
      }),
      TABLE,
      null,
    );
    expect(sql).toContain(
      'SELECT "status", COUNT(*)::int AS "__count__", COALESCE(SUM("amount")::float, 0) AS "sum_amount", AVG("amount")::float AS "avg_amount"',
    );
    expect(sql).toContain('GROUP BY "status"');
    expect(sql).toContain('ORDER BY "status" ASC');
  });

  it('GROUP BY without aggregations still emits __count__', () => {
    const { sql } = compileBlockQuery(
      req({ grouping: { columns: ['status'], openKeys: [] } }),
      TABLE,
      null,
    );
    expect(sql).toContain('COUNT(*)::int AS "__count__"');
    expect(sql).not.toContain('SUM');
  });

  it('rejects unknown aggregation columns', () => {
    expect(() =>
      compileBlockQuery(
        req({
          grouping: { columns: ['status'], openKeys: [] },
          aggregations: [{ columnId: 'bogus', fn: 'sum' }],
        }),
        TABLE,
        null,
      ),
    ).toThrow(/unknown column "bogus"/);
  });

  it('rejects unsupported aggregation fns', () => {
    expect(() =>
      compileBlockQuery(
        req({
          grouping: { columns: ['status'], openKeys: [] },
          aggregations: [
            // 'first' / 'last' aren't trivial in SQL — adapter explicitly errors.
            { columnId: 'amount', fn: 'first' },
          ],
        }),
        TABLE,
        null,
      ),
    ).toThrow(/unsupported aggregation/);
  });
});

describe('identifier quoting', () => {
  it('quotes schema-qualified table names per segment', () => {
    const { sql } = compileBlockQuery(req(), TABLE, null);
    expect(sql).toContain('"public"."orders"');
  });

  it('escapes embedded double quotes in identifiers', () => {
    const evilTable: PgTableDescriptor = {
      table: 'evil"name',
      columns: ['col'],
      primaryKey: 'col',
    };
    const { sql } = compileBlockQuery(req(), evilTable, null);
    expect(sql).toContain('"evil""name"');
  });
});
