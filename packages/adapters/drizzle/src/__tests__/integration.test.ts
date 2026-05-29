// =============================================================================
// @onegrid/drizzle — REAL-database integration tests via testcontainers.
//
// Drizzle is a multi-dialect ORM; this spec exercises the Postgres
// dialect specifically. The other dialects (mysql, sqlite) are
// covered by the per-adapter integration suites for those engines —
// drizzle's query-builder is the same shape across dialects, so a
// single-dialect verification gives us reasonable confidence.
// =============================================================================

import { existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { doublePrecision, integer, pgTable, text } from 'drizzle-orm/pg-core';
import { createDrizzleDataSource } from '../index';
import type { BlockRequest, Schema } from '@onegrid/protocol';

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

const CONTAINER_START_TIMEOUT_MS = 90_000;

const orders = pgTable('orders', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  revenue: doublePrecision('revenue').notNull(),
  status: text('status').notNull(),
});

const SCHEMA: Schema = [
  { id: 'id', type: 'int32' },
  { id: 'name', type: 'utf8' },
  { id: 'revenue', type: 'float64' },
  { id: 'status', type: 'utf8' },
];

let container: StartedPostgreSqlContainer | null = null;
let client: Client | null = null;
let db: NodePgDatabase | null = null;

beforeAll(async () => {
  if (SKIP) return;
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('onegrid_test')
    .withUsername('test')
    .withPassword('test')
    .start();
  client = new Client({ connectionString: container.getConnectionUri() });
  await client.connect();
  await client.query(`
    CREATE TABLE orders (
      id      INT PRIMARY KEY,
      name    TEXT NOT NULL,
      revenue DOUBLE PRECISION NOT NULL,
      status  TEXT NOT NULL
    );
  `);
  const statuses = ['active', 'pending', 'churned', 'pilot', 'archived'];
  const values: string[] = [];
  const params: unknown[] = [];
  for (let i = 1; i <= 50; i++) {
    const idx = (i - 1) * 4;
    values.push(`($${String(idx + 1)}, $${String(idx + 2)}, $${String(idx + 3)}, $${String(idx + 4)})`);
    params.push(i, `name_${i}`, ((i * 1009) % 10_000) / 100, statuses[i % statuses.length]);
  }
  await client.query(
    `INSERT INTO orders (id, name, revenue, status) VALUES ${values.join(', ')}`,
    params,
  );
  db = drizzle(client);
}, CONTAINER_START_TIMEOUT_MS);

afterAll(async () => {
  if (SKIP) return;
  await client?.end().catch(() => {});
  await container?.stop().catch(() => {});
}, 30_000);

describe.skipIf(SKIP)('@onegrid/drizzle — real-database integration', () => {
  it('fetchBlock returns rows via drizzle against real Postgres', async () => {
    const ds = createDrizzleDataSource({
      db: db! as any,
      table: orders,
      idColumn: 'id',
      schema: SCHEMA,
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
    expect((res.rows[0] as Record<string, unknown>).id).toBe(1);
    expect((res.rows[9] as Record<string, unknown>).id).toBe(10);
    expect(res.nextCursor).not.toBeNull();
  });

  it('keyset cursor paginates forward correctly across multiple blocks', async () => {
    const ds = createDrizzleDataSource({
      db: db! as any,
      table: orders,
      idColumn: 'id',
      schema: SCHEMA,
    });
    const seen: number[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 7; page++) {
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
    const ds = createDrizzleDataSource({
      db: db! as any,
      table: orders,
      idColumn: 'id',
      schema: SCHEMA,
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
    const ds = createDrizzleDataSource({
      db: db! as any,
      table: orders,
      idColumn: 'id',
      schema: SCHEMA,
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

  it('unknown column in a filter throws before hitting the database', async () => {
    const ds = createDrizzleDataSource({
      db: db! as any,
      table: orders,
      idColumn: 'id',
      schema: SCHEMA,
    });
    await expect(
      ds.fetchBlock({
        cursor: null,
        direction: 'after',
        limit: 5,
        sort: [{ columnId: 'id', direction: 'asc' }],
        filter: {
          type: 'comparison',
          columnId: 'evil"; DROP TABLE orders; --',
          op: 'eq',
          value: 'x',
        },
      }),
    ).rejects.toThrow(/unknown column/);
    const check = await client!.query('SELECT count(*)::int AS n FROM orders');
    expect(check.rows[0]?.n).toBe(50);
  });

  it('schema() returns the user-supplied schema', async () => {
    const ds = createDrizzleDataSource({
      db: db! as any,
      table: orders,
      idColumn: 'id',
      schema: SCHEMA,
    });
    expect(await ds.schema()).toEqual(SCHEMA);
  });
});
