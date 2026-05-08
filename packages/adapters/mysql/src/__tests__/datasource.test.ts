// =============================================================================
// MyDataSource — unit tests against a fake mysql2 queryable.
// =============================================================================

import { describe, expect, it } from 'vitest';
import type { Schema } from '@onegrid/protocol';
import { createMyDataSource, type MyQueryable } from '../datasource';
import { encodeKeysetCursor, type MyTableDescriptor } from '../sql';

const TABLE: MyTableDescriptor = {
  table: 'myapp.orders',
  columns: ['id', 'status', 'amount'],
  primaryKey: 'id',
};

const SCHEMA: Schema = [
  { id: 'id', type: 'int64' },
  { id: 'status', type: 'utf8' },
  { id: 'amount', type: 'float64' },
];

function makeFakeClient(
  rows: ReadonlyArray<Record<string, unknown>>,
): MyQueryable & { calls: { sql: string; params?: ReadonlyArray<unknown> }[] } {
  const calls: { sql: string; params?: ReadonlyArray<unknown> }[] = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({
        sql,
        ...(params !== undefined ? { params } : {}),
      });
      return [rows, null];
    },
  };
}

describe('createMyDataSource', () => {
  it('emits a keyset nextCursor when the result fills the page', async () => {
    const client = makeFakeClient([
      { id: 1, status: 'active', amount: 10 },
      { id: 2, status: 'active', amount: 20 },
    ]);
    const ds = createMyDataSource({ client, table: TABLE, schema: SCHEMA });
    const res = await ds.fetchBlock({
      cursor: null,
      direction: 'after',
      limit: 2,
      sort: [{ columnId: 'amount', direction: 'asc' }],
      filter: null,
    });
    expect(res.nextCursor).not.toBeNull();
    expect(res.nextCursor!.startsWith('ks:')).toBe(true);
  });

  it('forwards a decoded keyset cursor into the SQL params', async () => {
    const client = makeFakeClient([]);
    const ds = createMyDataSource({ client, table: TABLE, schema: SCHEMA });
    const cursor = encodeKeysetCursor({ sortValues: [50], rowId: 7 });
    await ds.fetchBlock({
      cursor,
      direction: 'after',
      limit: 100,
      sort: [{ columnId: 'amount', direction: 'asc' }],
      filter: null,
    });
    expect(client.calls.length).toBe(1);
    expect(client.calls[0]!.params).toEqual([50, 7, 100]);
    expect(client.calls[0]!.sql).toContain('(`amount`, `id`) > (?, ?)');
  });

  it('drops legacy offset cursors silently', async () => {
    const client = makeFakeClient([]);
    const ds = createMyDataSource({ client, table: TABLE, schema: SCHEMA });
    await ds.fetchBlock({
      cursor: 'offset:200',
      direction: 'after',
      limit: 100,
      sort: [],
      filter: null,
    });
    expect(client.calls[0]!.sql).not.toContain('>');
  });

  it('compiles a grouped query into one round-trip', async () => {
    const client = makeFakeClient([
      { status: 'active', __count__: 200_000, sum_amount: 9.99e9 },
    ]);
    const ds = createMyDataSource({ client, table: TABLE, schema: SCHEMA });
    await ds.fetchBlock({
      cursor: null,
      direction: 'after',
      limit: 100,
      sort: [],
      filter: null,
      grouping: { columns: ['status'], openKeys: [] },
      aggregations: [{ columnId: 'amount', fn: 'sum' }],
    });
    expect(client.calls.length).toBe(1);
    expect(client.calls[0]!.sql).toContain('GROUP BY `status`');
  });
});
