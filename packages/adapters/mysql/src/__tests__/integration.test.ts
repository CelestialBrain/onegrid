// =============================================================================
// @onegrid/mysql — REAL-database integration tests via testcontainers.
//
// Spins up MySQL 8 in a container, seeds a small table, drives
// BlockRequest through `mysql2/promise`, and asserts the
// SsrmDataSource contract holds against real MySQL semantics. See
// `packages/adapters/postgres/src/__tests__/integration.test.ts` for
// the canonical pattern this mirrors.
// =============================================================================

import { existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mysql from 'mysql2/promise';
import { MySqlContainer, type StartedMySqlContainer } from '@testcontainers/mysql';
import { createMyDataSource } from '../datasource';
import type { BlockRequest, Schema } from '@onegrid/protocol';
import type { MyTableDescriptor } from '../sql';

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

const CONTAINER_START_TIMEOUT_MS = 120_000;

const TABLE_SCHEMA: Schema = [
  { id: 'id', type: 'int32' },
  { id: 'name', type: 'utf8' },
  { id: 'revenue', type: 'float64' },
  { id: 'status', type: 'utf8' },
];

const TABLE_DESC: MyTableDescriptor = {
  table: 'orders',
  columns: ['id', 'name', 'revenue', 'status'],
  primaryKey: 'id',
};

let container: StartedMySqlContainer | null = null;
let connection: mysql.Connection | null = null;

beforeAll(async () => {
  if (SKIP) return;
  container = await new MySqlContainer('mysql:8.0')
    .withDatabase('onegrid_test')
    .withUsername('test')
    .withUserPassword('test')
    .withRootPassword('root')
    .start();
  connection = await mysql.createConnection({
    host: container.getHost(),
    port: container.getPort(),
    user: 'test',
    password: 'test',
    database: 'onegrid_test',
  });
  await connection.query(`
    CREATE TABLE orders (
      id      INT PRIMARY KEY,
      name    VARCHAR(64) NOT NULL,
      revenue DOUBLE NOT NULL,
      status  VARCHAR(32) NOT NULL
    );
  `);
  const statuses = ['active', 'pending', 'churned', 'pilot', 'archived'];
  const rows: Array<[number, string, number, string]> = [];
  for (let i = 1; i <= 50; i++) {
    rows.push([i, `name_${i}`, ((i * 1009) % 10_000) / 100, statuses[i % statuses.length]!]);
  }
  await connection.query('INSERT INTO orders (id, name, revenue, status) VALUES ?', [rows]);
}, CONTAINER_START_TIMEOUT_MS);

afterAll(async () => {
  if (SKIP) return;
  await connection?.end().catch(() => {});
  await container?.stop().catch(() => {});
}, 30_000);

describe.skipIf(SKIP)('@onegrid/mysql — real-database integration', () => {
  it('fetchBlock returns rows from real MySQL', async () => {
    const ds = createMyDataSource({
      client: { query: (sql, params) => connection!.query(sql, params ? [...params] : []) as any },
      table: TABLE_DESC,
      schema: TABLE_SCHEMA,
    });
    const req: BlockRequest = {
      cursor: null,
      direction: 'after',
      limit: 10,
      sort: [{ columnId: 'id', direction: 'asc' }],
      filter: null,
    };
    const res = await ds.fetchBlock(req);
    expect(res.rows.length).toBe(10);
    expect((res.rows[0] as Record<string, unknown> | undefined)?.id).toBe(1);
    expect((res.rows[9] as Record<string, unknown> | undefined)?.id).toBe(10);
    expect(res.nextCursor).not.toBeNull();
  });

  it('keyset cursor paginates forward correctly across multiple blocks', async () => {
    const ds = createMyDataSource({
      client: { query: (sql, params) => connection!.query(sql, params ? [...params] : []) as any },
      table: TABLE_DESC,
      schema: TABLE_SCHEMA,
    });
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
    const ds = createMyDataSource({
      client: { query: (sql, params) => connection!.query(sql, params ? [...params] : []) as any },
      table: TABLE_DESC,
      schema: TABLE_SCHEMA,
    });
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
    const ds = createMyDataSource({
      client: { query: (sql, params) => connection!.query(sql, params ? [...params] : []) as any },
      table: TABLE_DESC,
      schema: TABLE_SCHEMA,
    });
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
    const ds = createMyDataSource({
      client: { query: (sql, params) => connection!.query(sql, params ? [...params] : []) as any },
      table: TABLE_DESC,
      schema: TABLE_SCHEMA,
    });
    await expect(
      ds.fetchBlock({
        cursor: null,
        direction: 'after',
        limit: 5,
        sort: [{ columnId: 'id', direction: 'asc' }],
        filter: {
          type: 'comparison',
          columnId: "evil`; DROP TABLE orders; --",
          op: 'eq',
          value: 'x',
        },
      }),
    ).rejects.toThrow(/unknown column/);

    const [rows] = (await connection!.query('SELECT COUNT(*) AS n FROM orders')) as [
      Array<{ n: number }>,
      unknown,
    ];
    expect(Number(rows[0]!.n)).toBe(50);
  });

  it('schema() returns the static schema without hitting the database', async () => {
    const ds = createMyDataSource({
      client: { query: (sql, params) => connection!.query(sql, params ? [...params] : []) as any },
      table: TABLE_DESC,
      schema: TABLE_SCHEMA,
    });
    expect(await ds.schema()).toEqual(TABLE_SCHEMA);
  });
});
