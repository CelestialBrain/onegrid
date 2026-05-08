// =============================================================================
// SQLite SQL compiler — unit tests.
//
// Diverges from @onegrid/postgres at exactly two places (placeholders
// + agg type pinning). All other shapes match — this file mirrors the
// postgres test surface so divergences stay visible.
// =============================================================================

import { describe, expect, it } from 'vitest';
import type { BlockRequest } from '@onegrid/protocol';
import {
  compileBlockQuery,
  decodeKeysetCursor,
  encodeKeysetCursor,
  type SqliteTableDescriptor,
} from '../sql';

const TABLE: SqliteTableDescriptor = {
  table: 'main.orders',
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
  it('uses double-quote identifier quoting (Postgres-compatible)', () => {
    const { sql } = compileBlockQuery(req(), TABLE, null);
    expect(sql).toContain('"main"."orders"');
    expect(sql).toContain('"id", "status", "amount", "customer"');
  });

  it('uses ? placeholders, not numbered (MySQL-compatible)', () => {
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
    expect(sql).toContain('= ?');
    expect(sql).not.toMatch(/\$\d/);
    expect(params).toEqual(['active', 100]);
  });

  it('uses native NULLS FIRST / LAST in ORDER BY', () => {
    const { sql } = compileBlockQuery(
      req({
        sort: [
          { columnId: 'amount', direction: 'asc', nulls: 'first' },
          { columnId: 'status', direction: 'desc' },
        ],
      }),
      TABLE,
      null,
    );
    expect(sql).toContain(
      'ORDER BY "amount" ASC NULLS FIRST, "status" DESC NULLS LAST, "id" ASC',
    );
  });

  it('case-insensitive comparison wraps with LOWER()', () => {
    const { sql } = compileBlockQuery(
      req({
        filter: {
          type: 'comparison',
          columnId: 'customer',
          op: 'contains',
          value: 'foo',
          caseSensitive: false,
        },
      }),
      TABLE,
      null,
    );
    expect(sql).toContain("LOWER(\"customer\") LIKE LOWER(?) ESCAPE '\\'");
  });

  it('LIKE-special characters are escaped + ESCAPE clause is set', () => {
    const { sql, params } = compileBlockQuery(
      req({
        filter: {
          type: 'comparison',
          columnId: 'customer',
          op: 'contains',
          value: 'a%b_c',
        },
      }),
      TABLE,
      null,
    );
    expect(sql).toContain("ESCAPE '\\'");
    expect(params[0]).toBe('%a\\%b\\_c%');
  });

  it('keyset cursor compiles to a row-tuple comparison', () => {
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
    expect(sql).toContain('("status", "amount", "id") > (?, ?, ?)');
    expect(params).toEqual(['active', 50, 42, 100]);
  });

  it('rejects unknown columns', () => {
    expect(() =>
      compileBlockQuery(req({ columns: ['secret'] }), TABLE, null),
    ).toThrow(/unknown column "secret"/);
  });
});

describe('compileBlockQuery — grouped path', () => {
  it('emits no explicit casts (SQLite is dynamically typed)', () => {
    const { sql } = compileBlockQuery(
      req({
        grouping: { columns: ['status'], openKeys: [] },
        aggregations: [
          { columnId: 'amount', fn: 'sum' },
          { columnId: 'amount', fn: 'avg' },
        ],
      }),
      TABLE,
      null,
    );
    expect(sql).not.toContain('CAST');
    expect(sql).not.toContain('::int');
    expect(sql).not.toContain('::float');
    expect(sql).toContain('COALESCE(SUM("amount"), 0) AS "sum_amount"');
    expect(sql).toContain('AVG("amount") AS "avg_amount"');
    expect(sql).toContain('COUNT(*) AS "__count__"');
    expect(sql).toContain('GROUP BY "status"');
  });

  it('rejects unsupported aggregation fns', () => {
    expect(() =>
      compileBlockQuery(
        req({
          grouping: { columns: ['status'], openKeys: [] },
          aggregations: [{ columnId: 'amount', fn: 'first' }],
        }),
        TABLE,
        null,
      ),
    ).toThrow(/unsupported aggregation/);
  });
});

describe('identifier quoting', () => {
  it('escapes embedded double quotes', () => {
    const evilTable: SqliteTableDescriptor = {
      table: 'evil"name',
      columns: ['col'],
      primaryKey: 'col',
    };
    const { sql } = compileBlockQuery(req(), evilTable, null);
    expect(sql).toContain('"evil""name"');
  });
});
