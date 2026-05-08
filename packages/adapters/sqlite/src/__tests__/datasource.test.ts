// =============================================================================
// SqliteDataSource — unit tests against fake sync + async queryables.
// =============================================================================

import { describe, expect, it } from 'vitest';
import type { Schema } from '@onegrid/protocol';
import {
  createSqliteDataSource,
  type SqliteQueryable,
} from '../datasource';
import { encodeKeysetCursor, type SqliteTableDescriptor } from '../sql';

const TABLE: SqliteTableDescriptor = {
  table: 'main.orders',
  columns: ['id', 'status', 'amount'],
  primaryKey: 'id',
};

const SCHEMA: Schema = [
  { id: 'id', type: 'int64' },
  { id: 'status', type: 'utf8' },
  { id: 'amount', type: 'float64' },
];

function makeSyncClient(
  rows: ReadonlyArray<Record<string, unknown>>,
): SqliteQueryable & { calls: { sql: string; params?: ReadonlyArray<unknown> }[] } {
  const calls: { sql: string; params?: ReadonlyArray<unknown> }[] = [];
  return {
    calls,
    query(sql, params) {
      calls.push({
        sql,
        ...(params !== undefined ? { params } : {}),
      });
      return rows;
    },
  };
}

function makeAsyncClient(
  rows: ReadonlyArray<Record<string, unknown>>,
): SqliteQueryable & { calls: { sql: string; params?: ReadonlyArray<unknown> }[] } {
  const calls: { sql: string; params?: ReadonlyArray<unknown> }[] = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({
        sql,
        ...(params !== undefined ? { params } : {}),
      });
      return rows;
    },
  };
}

describe('createSqliteDataSource', () => {
  it('works with a sync queryable (better-sqlite3 pattern)', async () => {
    const client = makeSyncClient([
      { id: 1, status: 'active', amount: 10 },
    ]);
    const ds = createSqliteDataSource({ client, table: TABLE, schema: SCHEMA });
    const res = await ds.fetchBlock({
      cursor: null,
      direction: 'after',
      limit: 100,
      sort: [],
      filter: null,
    });
    expect(res.rows.length).toBe(1);
  });

  it('works with an async queryable (D1 / libsql pattern)', async () => {
    const client = makeAsyncClient([
      { id: 1, status: 'active', amount: 10 },
    ]);
    const ds = createSqliteDataSource({ client, table: TABLE, schema: SCHEMA });
    const res = await ds.fetchBlock({
      cursor: null,
      direction: 'after',
      limit: 100,
      sort: [],
      filter: null,
    });
    expect(res.rows.length).toBe(1);
  });

  it('emits a keyset nextCursor when the result fills the page', async () => {
    const client = makeSyncClient([
      { id: 1, status: 'active', amount: 10 },
      { id: 2, status: 'active', amount: 20 },
    ]);
    const ds = createSqliteDataSource({ client, table: TABLE, schema: SCHEMA });
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
    const client = makeSyncClient([]);
    const ds = createSqliteDataSource({ client, table: TABLE, schema: SCHEMA });
    const cursor = encodeKeysetCursor({ sortValues: [50], rowId: 7 });
    await ds.fetchBlock({
      cursor,
      direction: 'after',
      limit: 100,
      sort: [{ columnId: 'amount', direction: 'asc' }],
      filter: null,
    });
    expect(client.calls[0]!.params).toEqual([50, 7, 100]);
  });

  it('handles bigint primary keys (better-sqlite3 INTEGER → bigint)', async () => {
    const client = makeSyncClient([{ id: 99n, status: 'active', amount: 10 }]);
    const ds = createSqliteDataSource({ client, table: TABLE, schema: SCHEMA });
    const res = await ds.fetchBlock({
      cursor: null,
      direction: 'after',
      limit: 1,
      sort: [{ columnId: 'amount', direction: 'asc' }],
      filter: null,
    });
    // The cursor should encode the rowId as a Number (bigint coerced).
    expect(res.nextCursor).not.toBeNull();
  });

  it('drops legacy offset cursors silently', async () => {
    const client = makeSyncClient([]);
    const ds = createSqliteDataSource({ client, table: TABLE, schema: SCHEMA });
    await ds.fetchBlock({
      cursor: 'offset:200',
      direction: 'after',
      limit: 100,
      sort: [],
      filter: null,
    });
    expect(client.calls[0]!.sql).not.toContain('>');
  });
});
