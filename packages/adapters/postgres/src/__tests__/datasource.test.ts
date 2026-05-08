// =============================================================================
// PgDataSource — unit tests against a fake `pg` client.
// =============================================================================

import { describe, expect, it, vi } from 'vitest';
import type { Schema } from '@onegrid/protocol';
import { createPgDataSource, type PgQueryable } from '../datasource';
import { encodeKeysetCursor, type PgTableDescriptor } from '../sql';

const TABLE: PgTableDescriptor = {
  table: 'public.orders',
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
): PgQueryable & { calls: { sql: string; params?: ReadonlyArray<unknown> }[] } {
  const calls: { sql: string; params?: ReadonlyArray<unknown> }[] = [];
  return {
    calls,
    async query(text, params) {
      calls.push({
        sql: text,
        ...(params !== undefined ? { params } : {}),
      });
      return { rows };
    },
  };
}

describe('createPgDataSource', () => {
  it('returns the static schema', async () => {
    const client = makeFakeClient([]);
    const ds = createPgDataSource({ client, table: TABLE, schema: SCHEMA });
    expect(await ds.schema()).toEqual(SCHEMA);
  });

  it('emits a keyset nextCursor when the result fills the page', async () => {
    const client = makeFakeClient([
      { id: 1, status: 'active', amount: 10 },
      { id: 2, status: 'active', amount: 20 },
    ]);
    const ds = createPgDataSource({ client, table: TABLE, schema: SCHEMA });
    const res = await ds.fetchBlock({
      cursor: null,
      direction: 'after',
      limit: 2,
      sort: [{ columnId: 'amount', direction: 'asc' }],
      filter: null,
    });
    expect(res.nextCursor).not.toBeNull();
    expect(res.nextCursor!.startsWith('ks:')).toBe(true);
    expect(res.encoding).toBe('json');
    expect(res.rows.length).toBe(2);
  });

  it('omits nextCursor when the result is shorter than limit', async () => {
    const client = makeFakeClient([{ id: 1, status: 'active', amount: 10 }]);
    const ds = createPgDataSource({ client, table: TABLE, schema: SCHEMA });
    const res = await ds.fetchBlock({
      cursor: null,
      direction: 'after',
      limit: 100,
      sort: [],
      filter: null,
    });
    expect(res.nextCursor).toBeNull();
  });

  it('forwards a decoded keyset cursor into the SQL params', async () => {
    const client = makeFakeClient([]);
    const ds = createPgDataSource({ client, table: TABLE, schema: SCHEMA });
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
    expect(client.calls[0]!.sql).toContain('("amount", "id") > ($1, $2)');
  });

  it('drops legacy offset cursors silently (treats request as first block)', async () => {
    const client = makeFakeClient([]);
    const ds = createPgDataSource({ client, table: TABLE, schema: SCHEMA });
    await ds.fetchBlock({
      cursor: 'offset:200',
      direction: 'after',
      limit: 100,
      sort: [],
      filter: null,
    });
    expect(client.calls[0]!.sql).not.toContain('>');
    expect(client.calls[0]!.params).toEqual([100]);
  });

  it('compiles a grouped query with aggregations into one round-trip', async () => {
    const client = makeFakeClient([
      { status: 'active', __count__: 200_000, sum_amount: 9.99e9 },
      { status: 'pending', __count__: 200_000, sum_amount: 9.99e9 },
    ]);
    const ds = createPgDataSource({ client, table: TABLE, schema: SCHEMA });
    const res = await ds.fetchBlock({
      cursor: null,
      direction: 'after',
      limit: 100,
      sort: [],
      filter: null,
      grouping: { columns: ['status'], openKeys: [] },
      aggregations: [{ columnId: 'amount', fn: 'sum' }],
    });
    expect(client.calls.length).toBe(1);
    expect(client.calls[0]!.sql).toContain('GROUP BY "status"');
    expect(res.rows.length).toBe(2);
  });

  it('throws when the primary key column produces a non-id type', async () => {
    const client = makeFakeClient([
      { id: { weird: true }, status: 'x', amount: 0 },
    ]);
    const ds = createPgDataSource({ client, table: TABLE, schema: SCHEMA });
    await expect(
      ds.fetchBlock({
        cursor: null,
        direction: 'after',
        limit: 1,
        sort: [],
        filter: null,
      }),
    ).rejects.toThrow(/primary key "id" produced/);
  });
});
