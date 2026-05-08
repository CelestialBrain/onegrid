// =============================================================================
// ClickHouse SQL compiler — unit tests.
//
// ClickHouse uses named parameters (`{pN:Type}`) instead of the
// positional placeholders other adapters use; these tests assert
// on both the SQL text AND the parameter map.
// =============================================================================

import { describe, expect, it } from 'vitest';
import type { BlockRequest } from '@onegrid/protocol';
import {
  compileBlockQuery,
  decodeKeysetCursor,
  encodeKeysetCursor,
  type ChTableDescriptor,
} from '../sql';

const TABLE: ChTableDescriptor = {
  table: 'default.events',
  columns: ['id', 'kind', 'amount'],
  primaryKey: 'id',
  columnTypes: {
    id: 'UInt64',
    kind: 'String',
    amount: 'Float64',
  },
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
  it('uses backtick identifier quoting', () => {
    const { sql } = compileBlockQuery(req(), TABLE, null);
    expect(sql).toContain('`default`.`events`');
    expect(sql).toContain('`id`, `kind`, `amount`');
  });

  it('uses named-parameter placeholders with type hints from columnTypes', () => {
    const { sql, params } = compileBlockQuery(
      req({
        filter: {
          type: 'comparison',
          columnId: 'kind',
          op: 'eq',
          value: 'login',
        },
      }),
      TABLE,
      null,
    );
    expect(sql).toContain('`kind` = {p0:String}');
    expect(sql).toContain('LIMIT {p1:UInt64}');
    expect(params).toEqual({ p0: 'login', p1: 100 });
  });

  it('numeric column types flow through the columnTypes map', () => {
    const { sql, params } = compileBlockQuery(
      req({
        filter: {
          type: 'comparison',
          columnId: 'amount',
          op: 'gt',
          value: 99.5,
        },
      }),
      TABLE,
      null,
    );
    expect(sql).toContain('`amount` > {p0:Float64}');
    expect(params.p0).toBe(99.5);
  });

  it('falls back to String type when columnTypes is omitted', () => {
    const noTypes: ChTableDescriptor = {
      table: 'events',
      columns: ['id', 'kind'],
      primaryKey: 'id',
    };
    const { sql, params } = compileBlockQuery(
      req({
        filter: {
          type: 'comparison',
          columnId: 'kind',
          op: 'eq',
          value: 'x',
        },
      }),
      noTypes,
      null,
    );
    expect(sql).toContain('{p0:String}');
    expect(params.p0).toBe('x');
  });

  it('uses ILIKE on case-insensitive contains', () => {
    const { sql } = compileBlockQuery(
      req({
        filter: {
          type: 'comparison',
          columnId: 'kind',
          op: 'contains',
          value: 'log',
          caseSensitive: false,
        },
      }),
      TABLE,
      null,
    );
    expect(sql).toContain('`kind` ILIKE {p0:String}');
  });

  it('uses LIKE on case-sensitive contains', () => {
    const { sql } = compileBlockQuery(
      req({
        filter: {
          type: 'comparison',
          columnId: 'kind',
          op: 'contains',
          value: 'log',
          caseSensitive: true,
        },
      }),
      TABLE,
      null,
    );
    expect(sql).toContain('`kind` LIKE {p0:String}');
    expect(sql).not.toContain('ILIKE');
  });

  it('IN expands into multiple typed placeholders', () => {
    const { sql, params } = compileBlockQuery(
      req({
        filter: {
          type: 'comparison',
          columnId: 'kind',
          op: 'in',
          values: ['login', 'logout', 'view'],
        },
      }),
      TABLE,
      null,
    );
    expect(sql).toContain(
      '`kind` IN ({p0:String}, {p1:String}, {p2:String})',
    );
    expect(params).toMatchObject({ p0: 'login', p1: 'logout', p2: 'view' });
  });

  it('keyset cursor compiles to row-tuple comparison with typed placeholders', () => {
    const cursor = decodeKeysetCursor(
      encodeKeysetCursor({ sortValues: ['login'], rowId: 7 }),
    );
    const { sql, params } = compileBlockQuery(
      req({
        sort: [{ columnId: 'kind', direction: 'asc' }],
      }),
      TABLE,
      cursor,
    );
    expect(sql).toContain('(`kind`, `id`) > ({p0:String}, {p1:UInt64})');
    expect(params).toMatchObject({ p0: 'login', p1: 7 });
  });
});

describe('compileBlockQuery — grouped path', () => {
  it('uses ClickHouse aggregate functions with type-pinning casts', () => {
    const { sql } = compileBlockQuery(
      req({
        grouping: { columns: ['kind'], openKeys: [] },
        aggregations: [
          { columnId: 'amount', fn: 'sum' },
          { columnId: 'amount', fn: 'avg' },
          { columnId: '*', fn: 'count' },
          { columnId: 'kind', fn: 'countDistinct', alias: 'unique_kinds' },
        ],
      }),
      TABLE,
      null,
    );
    expect(sql).toContain('toFloat64(sum(`amount`)) AS `sum_amount`');
    expect(sql).toContain('toFloat64(avg(`amount`)) AS `avg_amount`');
    expect(sql).toContain('toUInt64(count(*)) AS `count_*`');
    expect(sql).toContain('toUInt64(uniqExact(`kind`)) AS `unique_kinds`');
    expect(sql).toContain('toUInt64(count()) AS `__count__`');
    expect(sql).toContain('GROUP BY `kind`');
  });

  it('rejects unsupported aggregation fns', () => {
    expect(() =>
      compileBlockQuery(
        req({
          grouping: { columns: ['kind'], openKeys: [] },
          aggregations: [{ columnId: 'amount', fn: 'first' }],
        }),
        TABLE,
        null,
      ),
    ).toThrow(/unsupported aggregation/);
  });
});

describe('identifier quoting', () => {
  it('escapes embedded backticks', () => {
    const evilTable: ChTableDescriptor = {
      table: 'evil`name',
      columns: ['col'],
      primaryKey: 'col',
    };
    const { sql } = compileBlockQuery(req(), evilTable, null);
    expect(sql).toContain('`evil``name`');
  });
});
