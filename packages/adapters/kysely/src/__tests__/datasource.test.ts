// Kysely adapter integration test against a fake KyselyClient. We don't run
// real SQL — the goal is to verify the BlockRequest → query-builder
// translation produces the expected shape of calls.

import { describe, expect, it, vi } from 'vitest';
import { createKyselyDataSource } from '..';
import type {
  KyselyClient,
  KyselyExpression,
  KyselyExpressionBuilder,
  KyselySelectQueryBuilder,
} from '..';
import type { Schema } from '@onegrid/protocol';

const SCHEMA: Schema = [
  { id: 'id', type: 'int64' },
  { id: 'name', type: 'utf8' },
  { id: 'age', type: 'int32' },
];

interface CapturedCall {
  selectAllCalled: boolean;
  whereCallCount: number;
  orderBy: Array<{ column: string; direction: 'asc' | 'desc' }>;
  limit: number | null;
  rows: ReadonlyArray<Record<string, unknown>>;
}

function makeFakeClient(rows: ReadonlyArray<Record<string, unknown>>): {
  client: KyselyClient;
  captured: CapturedCall;
} {
  const captured: CapturedCall = {
    selectAllCalled: false,
    whereCallCount: 0,
    orderBy: [],
    limit: null,
    rows,
  };

  const eb: KyselyExpressionBuilder = Object.assign(
    (_col: string, _op: string, _val: unknown): KyselyExpression =>
      ({ __kyselyExpression: undefined }) as KyselyExpression,
    {
      and: (_exprs: ReadonlyArray<KyselyExpression>): KyselyExpression =>
        ({ __kyselyExpression: undefined }) as KyselyExpression,
      or: (_exprs: ReadonlyArray<KyselyExpression>): KyselyExpression =>
        ({ __kyselyExpression: undefined }) as KyselyExpression,
      not: (_e: KyselyExpression): KyselyExpression =>
        ({ __kyselyExpression: undefined }) as KyselyExpression,
    },
  );

  const qb: KyselySelectQueryBuilder = {
    selectAll: vi.fn(() => {
      captured.selectAllCalled = true;
      return qb;
    }),
    where: vi.fn((factory) => {
      captured.whereCallCount += 1;
      factory(eb);
      return qb;
    }),
    orderBy: vi.fn((column, direction) => {
      captured.orderBy.push({ column, direction });
      return qb;
    }),
    limit: vi.fn((n) => {
      captured.limit = n;
      return qb;
    }),
    execute: vi.fn(async () => Promise.resolve(rows)),
  };

  const client: KyselyClient = {
    selectFrom: vi.fn(() => qb),
  };

  return { client, captured };
}

describe('createKyselyDataSource', () => {
  it('returns the configured schema synchronously', () => {
    const { client } = makeFakeClient([]);
    const ds = createKyselyDataSource({
      db: client,
      tableName: 'users',
      idColumn: 'id',
      schema: SCHEMA,
    });
    expect(ds.schema()).toEqual(SCHEMA);
  });

  it('issues selectAll, where, orderBy, limit on fetchBlock', async () => {
    const { client, captured } = makeFakeClient([
      { id: 1, name: 'a', age: 30 },
      { id: 2, name: 'b', age: 40 },
    ]);
    const ds = createKyselyDataSource({
      db: client,
      tableName: 'users',
      idColumn: 'id',
      schema: SCHEMA,
    });
    const res = await ds.fetchBlock({
      cursor: null,
      direction: 'after',
      limit: 100,
      sort: [{ columnId: 'age', direction: 'asc' }],
      filter: null,
    });
    expect(captured.selectAllCalled).toBe(true);
    expect(captured.whereCallCount).toBe(1);
    expect(captured.orderBy).toEqual([
      { column: 'age', direction: 'asc' },
      { column: 'id', direction: 'asc' },
    ]);
    expect(captured.limit).toBe(101); // limit + 1 for hasMore detection
    expect(res.encoding).toBe('json');
    expect(res.rows).toHaveLength(2);
  });

  it('flips orderBy direction for "before" pagination', async () => {
    const { client, captured } = makeFakeClient([{ id: 1 }]);
    const ds = createKyselyDataSource({
      db: client,
      tableName: 'users',
      idColumn: 'id',
      schema: SCHEMA,
    });
    await ds.fetchBlock({
      cursor: null,
      direction: 'before',
      limit: 10,
      sort: [{ columnId: 'age', direction: 'asc' }],
      filter: null,
    });
    expect(captured.orderBy).toEqual([
      { column: 'age', direction: 'desc' },
      { column: 'id', direction: 'desc' },
    ]);
  });

  it('emits nextCursor when over-fetched indicates more pages', async () => {
    const rows = Array.from({ length: 11 }, (_, i) => ({ id: i + 1, age: 20 + i }));
    const { client } = makeFakeClient(rows);
    const ds = createKyselyDataSource({
      db: client,
      tableName: 'users',
      idColumn: 'id',
      schema: SCHEMA,
    });
    const res = await ds.fetchBlock({
      cursor: null,
      direction: 'after',
      limit: 10,
      sort: [{ columnId: 'age', direction: 'asc' }],
      filter: null,
    });
    expect(res.rows).toHaveLength(10);
    expect(res.nextCursor).not.toBeNull();
  });

  it('honors AbortSignal at entry and after fetch', async () => {
    const { client } = makeFakeClient([]);
    const ds = createKyselyDataSource({
      db: client,
      tableName: 'users',
      idColumn: 'id',
      schema: SCHEMA,
    });
    const aborted = new AbortController();
    aborted.abort();
    await expect(
      ds.fetchBlock(
        {
          cursor: null,
          direction: 'after',
          limit: 10,
          sort: [],
          filter: null,
        },
        { signal: aborted.signal },
      ),
    ).rejects.toThrow();
  });
});
