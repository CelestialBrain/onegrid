// =============================================================================
// @onegrid/clickhouse — REAL-database integration tests via testcontainers.
//
// Spins up ClickHouse in a container, seeds a small table, and
// drives BlockRequest through @clickhouse/client adapted to the
// ChQueryable shape. Uses JSONEachRow throughout — Arrow IPC is
// exercised by the unit tests; the real-DB job here is to prove the
// SQL the compiler emits is accepted by a real ClickHouse server.
// =============================================================================

import { existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type ClickHouseClient } from '@clickhouse/client';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { createChDataSource } from '../datasource';
import type { ChQueryable } from '../datasource';
import type { BlockRequest, Schema } from '@onegrid/protocol';
import type { ChTableDescriptor } from '../sql';

function detectDockerHost(): string | null {
  if (process.env.DOCKER_HOST) return process.env.DOCKER_HOST;
  const candidates = [
    `${homedir()}/.orbstack/run/docker.sock`,
    `${homedir()}/.docker/run/docker.sock`,
    `${homedir()}/.colima/default/docker.sock`,
    '/var/run/docker.sock',
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      try {
        if (statSync(path).isSocket()) return `unix://${path}`;
      } catch {
        // try next
      }
    }
  }
  return null;
}

const dockerHost = detectDockerHost();
if (dockerHost && !process.env.DOCKER_HOST) {
  process.env.DOCKER_HOST = dockerHost;
}
const SKIP = process.env.ONEGRID_SKIP_TESTCONTAINERS === '1' || dockerHost === null;

const CONTAINER_START_TIMEOUT_MS = 180_000;

const TABLE_SCHEMA: Schema = [
  { id: 'id', type: 'int32' },
  { id: 'name', type: 'utf8' },
  { id: 'revenue', type: 'float64' },
  { id: 'status', type: 'utf8' },
];

const TABLE_DESC: ChTableDescriptor = {
  table: 'default.orders',
  columns: ['id', 'name', 'revenue', 'status'],
  primaryKey: 'id',
  columnTypes: {
    id: 'Int32',
    name: 'String',
    revenue: 'Float64',
    status: 'String',
  },
};

let container: StartedTestContainer | null = null;
let client: ClickHouseClient | null = null;
let queryable: ChQueryable;

beforeAll(async () => {
  if (SKIP) return;
  container = await new GenericContainer('clickhouse/clickhouse-server:24.8-alpine')
    .withExposedPorts(8123, 9000)
    .withEnvironment({
      CLICKHOUSE_DB: 'default',
      CLICKHOUSE_USER: 'default',
      CLICKHOUSE_PASSWORD: '',
      CLICKHOUSE_SKIP_USER_SETUP: '1',
    })
    .withWaitStrategy(Wait.forHttp('/ping', 8123).forStatusCode(200))
    .withStartupTimeout(120_000)
    .start();

  const url = `http://${container.getHost()}:${container.getMappedPort(8123)}`;
  client = createClient({ url, username: 'default', password: '' });

  await client.command({
    query: `
      CREATE TABLE default.orders (
        id      Int32,
        name    String,
        revenue Float64,
        status  String
      ) ENGINE = MergeTree ORDER BY id
    `,
  });

  const statuses = ['active', 'pending', 'churned', 'pilot', 'archived'];
  const rows: Array<Record<string, unknown>> = [];
  for (let i = 1; i <= 50; i++) {
    rows.push({
      id: i,
      name: `name_${i}`,
      revenue: ((i * 1009) % 10_000) / 100,
      status: statuses[i % statuses.length],
    });
  }
  await client.insert({ table: 'default.orders', values: rows, format: 'JSONEachRow' });

  queryable = {
    async query(req) {
      // The adapter defaults to JSONEachRow; the integration spec never
      // exercises the Arrow path (covered by unit tests). Reject anything
      // else so the format mismatch is loud rather than silently coerced.
      if (req.format !== 'JSONEachRow') {
        throw new Error(`integration queryable only supports JSONEachRow (got ${req.format})`);
      }
      const result = await client!.query({
        query: req.sql,
        query_params: req.params as Record<string, unknown>,
        format: 'JSONEachRow',
      });
      const rowsOut = (await result.json()) as ReadonlyArray<Record<string, unknown>>;
      return { format: 'JSONEachRow', rows: rowsOut };
    },
  };
}, CONTAINER_START_TIMEOUT_MS);

afterAll(async () => {
  if (SKIP) return;
  await client?.close().catch(() => {});
  await container?.stop().catch(() => {});
}, 30_000);

describe.skipIf(SKIP)('@onegrid/clickhouse — real-database integration', () => {
  it('fetchBlock returns rows from real ClickHouse', async () => {
    const ds = createChDataSource({ client: queryable, table: TABLE_DESC, schema: TABLE_SCHEMA });
    const req: BlockRequest = {
      cursor: null,
      direction: 'after',
      limit: 10,
      sort: [{ columnId: 'id', direction: 'asc' }],
      filter: null,
    };
    const res = await ds.fetchBlock(req);
    expect(res.rows.length).toBe(10);
    expect(Number((res.rows[0] as Record<string, unknown>).id)).toBe(1);
    expect(Number((res.rows[9] as Record<string, unknown>).id)).toBe(10);
    expect(res.nextCursor).not.toBeNull();
  });

  it('keyset cursor paginates forward correctly across multiple blocks', async () => {
    const ds = createChDataSource({ client: queryable, table: TABLE_DESC, schema: TABLE_SCHEMA });
    const seen: number[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 6; page++) {
      const res = await ds.fetchBlock({
        cursor,
        direction: 'after',
        limit: 10,
        sort: [{ columnId: 'id', direction: 'asc' }],
        filter: null,
      });
      for (const r of res.rows as ReadonlyArray<Record<string, unknown>>) {
        seen.push(Number(r.id));
      }
      cursor = res.nextCursor;
      if (cursor === null) break;
    }
    expect(seen).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
  });

  it('sort desc by revenue puts the largest first', async () => {
    const ds = createChDataSource({ client: queryable, table: TABLE_DESC, schema: TABLE_SCHEMA });
    const res = await ds.fetchBlock({
      cursor: null,
      direction: 'after',
      limit: 5,
      sort: [{ columnId: 'revenue', direction: 'desc' }],
      filter: null,
    });
    expect(res.rows.length).toBe(5);
    const revenues = (res.rows as ReadonlyArray<Record<string, unknown>>).map((r) =>
      Number(r.revenue),
    );
    for (let i = 1; i < revenues.length; i++) {
      expect(revenues[i]).toBeLessThanOrEqual(revenues[i - 1]!);
    }
  });

  it('filter narrows results to matching rows', async () => {
    const ds = createChDataSource({ client: queryable, table: TABLE_DESC, schema: TABLE_SCHEMA });
    const res = await ds.fetchBlock({
      cursor: null,
      direction: 'after',
      limit: 100,
      sort: [{ columnId: 'id', direction: 'asc' }],
      filter: { type: 'comparison', columnId: 'status', op: 'eq', value: 'active' },
    });
    expect(res.rows.length).toBeGreaterThan(0);
    expect(res.rows.length).toBeLessThan(50);
    for (const r of res.rows as ReadonlyArray<Record<string, unknown>>) {
      expect(r.status).toBe('active');
    }
  });

  it('unknown column in a filter is rejected at SQL compile time (no SQL injection)', async () => {
    const ds = createChDataSource({ client: queryable, table: TABLE_DESC, schema: TABLE_SCHEMA });
    await expect(
      ds.fetchBlock({
        cursor: null,
        direction: 'after',
        limit: 5,
        sort: [{ columnId: 'id', direction: 'asc' }],
        filter: {
          type: 'comparison',
          columnId: 'evil`; DROP TABLE orders; --',
          op: 'eq',
          value: 'x',
        },
      }),
    ).rejects.toThrow(/unknown column/);

    const check = await client!.query({
      query: 'SELECT count() AS n FROM default.orders',
      format: 'JSONEachRow',
    });
    const rows = (await check.json()) as Array<{ n: number | string }>;
    expect(Number(rows[0]!.n)).toBe(50);
  });

  it('schema() returns the static schema without hitting the database', async () => {
    const ds = createChDataSource({ client: queryable, table: TABLE_DESC, schema: TABLE_SCHEMA });
    expect(await ds.schema()).toEqual(TABLE_SCHEMA);
  });
});
