// =============================================================================
// ChDataSource — unit tests against a fake queryable.
// =============================================================================

import { describe, expect, it } from 'vitest';
import type { Schema } from '@onegrid/protocol';
import {
  createChDataSource,
  type ChQueryRequest,
  type ChQueryResult,
  type ChQueryable,
} from '../datasource';
import { encodeKeysetCursor, type ChTableDescriptor } from '../sql';

const TABLE: ChTableDescriptor = {
  table: 'default.events',
  columns: ['id', 'kind', 'amount'],
  primaryKey: 'id',
  columnTypes: { id: 'UInt64', kind: 'String', amount: 'Float64' },
};

const SCHEMA: Schema = [
  { id: 'id', type: 'int64' },
  { id: 'kind', type: 'utf8' },
  { id: 'amount', type: 'float64' },
];

function makeJsonClient(
  rows: ReadonlyArray<Record<string, unknown>>,
): ChQueryable & { calls: ChQueryRequest[] } {
  const calls: ChQueryRequest[] = [];
  return {
    calls,
    async query(req) {
      calls.push(req);
      return { format: 'JSONEachRow', rows };
    },
  };
}

function makeArrowClient(bytes: Uint8Array): ChQueryable & { calls: ChQueryRequest[] } {
  const calls: ChQueryRequest[] = [];
  return {
    calls,
    async query(req) {
      calls.push(req);
      const result: ChQueryResult = { format: 'Arrow', bytes };
      return result;
    },
  };
}

describe('createChDataSource — JSON path', () => {
  it('asks the client for JSONEachRow by default', async () => {
    const client = makeJsonClient([
      { id: 1, kind: 'login', amount: 0 },
    ]);
    const ds = createChDataSource({ client, table: TABLE, schema: SCHEMA });
    await ds.fetchBlock({
      cursor: null,
      direction: 'after',
      limit: 100,
      sort: [],
      filter: null,
    });
    expect(client.calls[0]!.format).toBe('JSONEachRow');
  });

  it('emits a keyset nextCursor when the result fills the page', async () => {
    const client = makeJsonClient([
      { id: 1, kind: 'login', amount: 0 },
      { id: 2, kind: 'login', amount: 1 },
    ]);
    const ds = createChDataSource({ client, table: TABLE, schema: SCHEMA });
    const res = await ds.fetchBlock({
      cursor: null,
      direction: 'after',
      limit: 2,
      sort: [{ columnId: 'amount', direction: 'asc' }],
      filter: null,
    });
    expect(res.encoding).toBe('json');
    expect(res.nextCursor).not.toBeNull();
    expect(res.nextCursor!.startsWith('ks:')).toBe(true);
  });

  it('forwards a decoded keyset cursor into the params map', async () => {
    const client = makeJsonClient([]);
    const ds = createChDataSource({ client, table: TABLE, schema: SCHEMA });
    const cursor = encodeKeysetCursor({ sortValues: [50], rowId: 7 });
    await ds.fetchBlock({
      cursor,
      direction: 'after',
      limit: 100,
      sort: [{ columnId: 'amount', direction: 'asc' }],
      filter: null,
    });
    const sentParams = client.calls[0]!.params;
    expect(sentParams).toMatchObject({ p0: 50, p1: 7, p2: 100 });
  });
});

describe('createChDataSource — Arrow IPC path', () => {
  it('asks the client for Arrow when format=Arrow is configured', async () => {
    const client = makeArrowClient(new Uint8Array([1, 2, 3]));
    const ds = createChDataSource({
      client,
      table: TABLE,
      schema: SCHEMA,
      format: 'Arrow',
    });
    await ds.fetchBlock({
      cursor: null,
      direction: 'after',
      limit: 100,
      sort: [],
      filter: null,
    });
    expect(client.calls[0]!.format).toBe('Arrow');
  });

  it('returns BlockResponse<arrow-ipc> with raw bytes', async () => {
    const bytes = new Uint8Array([0xab, 0xcd]);
    const client = makeArrowClient(bytes);
    const ds = createChDataSource({
      client,
      table: TABLE,
      schema: SCHEMA,
      format: 'Arrow',
    });
    const res = await ds.fetchBlock({
      cursor: null,
      direction: 'after',
      limit: 100,
      sort: [],
      filter: null,
    });
    expect(res.encoding).toBe('arrow-ipc');
    expect(res.rows).toBe(bytes);
    expect(res.nextCursor).toBeNull();
  });
});
