// =============================================================================
// MySQL SQL compiler — unit tests.
//
// Mirrors the @onegrid/postgres test surface so MySQL-vs-Postgres
// divergence is visible in matching assertions:
//   - identifier quoting: backtick instead of double-quote
//   - placeholder: `?` instead of `$N`
//   - NULLS handling: emulated `IS NULL` ordering instead of native
// =============================================================================

import { describe, expect, it } from 'vitest';
import type { BlockRequest } from '@onegrid/protocol';
import {
  compileBlockQuery,
  decodeKeysetCursor,
  encodeKeysetCursor,
  type MyTableDescriptor,
} from '../sql';

const TABLE: MyTableDescriptor = {
  table: 'myapp.orders',
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
  it('uses backtick quoting on schema-qualified identifiers', () => {
    const { sql } = compileBlockQuery(req(), TABLE, null);
    expect(sql).toContain('`myapp`.`orders`');
    expect(sql).toContain('`id`, `status`, `amount`, `customer`');
  });

  it('uses ? placeholders, not numbered', () => {
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

  it('emulates NULLS LAST via leading IS NULL ordering', () => {
    const { sql } = compileBlockQuery(
      req({
        sort: [{ columnId: 'amount', direction: 'asc', nulls: 'last' }],
      }),
      TABLE,
      null,
    );
    expect(sql).toContain('`amount` IS NULL ASC, `amount` ASC');
  });

  it('emulates NULLS FIRST via reversed IS NULL ordering', () => {
    const { sql } = compileBlockQuery(
      req({
        sort: [{ columnId: 'amount', direction: 'desc', nulls: 'first' }],
      }),
      TABLE,
      null,
    );
    expect(sql).toContain('`amount` IS NULL DESC, `amount` DESC');
  });

  it('case-sensitive comparison wraps with BINARY', () => {
    const { sql } = compileBlockQuery(
      req({
        filter: {
          type: 'comparison',
          columnId: 'customer',
          op: 'contains',
          value: 'foo',
          caseSensitive: true,
        },
      }),
      TABLE,
      null,
    );
    expect(sql).toContain('BINARY `customer` LIKE');
  });

  it('case-insensitive comparison passes through (collation handles it)', () => {
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
    expect(sql).toContain('`customer` LIKE');
    expect(sql).not.toContain('BINARY');
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
    expect(sql).toContain('(`status`, `amount`, `id`) > (?, ?, ?)');
    expect(params).toEqual(['active', 50, 42, 100]);
  });

  it('rejects unknown columns in projection / filter / sort', () => {
    expect(() =>
      compileBlockQuery(req({ columns: ['secret'] }), TABLE, null),
    ).toThrow(/unknown column "secret"/);
    expect(() =>
      compileBlockQuery(
        req({
          filter: { type: 'comparison', columnId: 'foo', op: 'eq', value: 1 },
        }),
        TABLE,
        null,
      ),
    ).toThrow(/unknown column "foo"/);
    expect(() =>
      compileBlockQuery(
        req({ sort: [{ columnId: 'baz', direction: 'asc' }] }),
        TABLE,
        null,
      ),
    ).toThrow(/unknown column "baz"/);
  });
});

describe('compileBlockQuery — grouped path', () => {
  it('emits CAST(... AS DOUBLE) on aggregate columns', () => {
    const { sql } = compileBlockQuery(
      req({
        grouping: { columns: ['status'], openKeys: [] },
        aggregations: [{ columnId: 'amount', fn: 'sum' }],
      }),
      TABLE,
      null,
    );
    expect(sql).toContain('CAST(COALESCE(SUM(`amount`), 0) AS DOUBLE)');
    expect(sql).toContain('CAST(COUNT(*) AS SIGNED) AS `__count__`');
    expect(sql).toContain('GROUP BY `status`');
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

describe('LIKE escaping', () => {
  it('escapes %, _, and \\ in contains values', () => {
    const { params } = compileBlockQuery(
      req({
        filter: {
          type: 'comparison',
          columnId: 'customer',
          op: 'contains',
          value: 'a%b_c\\d',
        },
      }),
      TABLE,
      null,
    );
    expect(params[0]).toBe('%a\\%b\\_c\\\\d%');
  });
});

describe('identifier quoting', () => {
  it('escapes embedded backticks', () => {
    const evilTable: MyTableDescriptor = {
      table: 'evil`name',
      columns: ['col'],
      primaryKey: 'col',
    };
    const { sql } = compileBlockQuery(req(), evilTable, null);
    expect(sql).toContain('`evil``name`');
  });
});
