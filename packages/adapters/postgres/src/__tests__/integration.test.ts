// =============================================================================
// @onegrid/postgres — REAL-database integration tests via testcontainers.
//
// The existing sql.test.ts / datasource.test.ts / cdc.test.ts run
// against an in-memory mock PgQueryable. They verify SQL string
// generation and the data-source contract surface — but they never
// hit a real Postgres. Today this adapter is 1.4K LOC that's never
// been run end-to-end.
//
// This spec closes that gap. It spins up Postgres 16 in a container,
// seeds a small table, drives BlockRequest through the real wire
// (including pagination with keyset cursors), and asserts the
// SsrmDataSource contract holds against real PG semantics.
//
// Cost: the container takes ~5-15 s to pull/start on a cold cache.
// CI flag: set ONEGRID_SKIP_TESTCONTAINERS=1 to skip in environments
// where Docker isn't available (e.g. some CI runners). The container
// will auto-detect OrbStack / Docker Desktop / Colima.
// =============================================================================

import { existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { createPgDataSource, type PgDataSourceOptions } from '../datasource';
import type { BlockRequest, Schema } from '@onegrid/protocol';

// Auto-detect a Docker-compatible socket so a default `pnpm test` skips
// gracefully on machines without Docker, while still running the real
// integration when a daemon is available (OrbStack, Docker Desktop,
// Colima, plain `docker`). Honour an explicit DOCKER_HOST too.
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
        if (statSync(path).isSocket()) {
          return `unix://${path}`;
        }
      } catch {
        // permission denied / race — try next
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

// 90 s allows cold image pull on most networks.
const CONTAINER_START_TIMEOUT_MS = 90_000;

const TABLE_SCHEMA: Schema = [
  { id: 'id', type: 'int32' },
  { id: 'name', type: 'utf8' },
  { id: 'revenue', type: 'float64' },
  { id: 'status', type: 'utf8' },
];

const TABLE_DESC: PgDataSourceOptions['table'] = {
  table: 'public.orders',
  columns: ['id', 'name', 'revenue', 'status'],
  primaryKey: 'id',
};

let container: StartedPostgreSqlContainer | null = null;
let client: Client | null = null;

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
    CREATE TABLE public.orders (
      id        INT PRIMARY KEY,
      name      TEXT NOT NULL,
      revenue   DOUBLE PRECISION NOT NULL,
      status    TEXT NOT NULL
    );
  `);
  // Seed 50 rows so we can exercise pagination + sort.
  const statuses = ['active', 'pending', 'churned', 'pilot', 'archived'];
  const values: string[] = [];
  const params: unknown[] = [];
  for (let i = 1; i <= 50; i++) {
    const idx = (i - 1) * 4;
    values.push(`($${String(idx + 1)}, $${String(idx + 2)}, $${String(idx + 3)}, $${String(idx + 4)})`);
    params.push(i, `name_${String(i)}`, ((i * 1009) % 10_000) / 100, statuses[i % statuses.length]);
  }
  await client.query(
    `INSERT INTO public.orders (id, name, revenue, status) VALUES ${values.join(', ')}`,
    params,
  );
}, CONTAINER_START_TIMEOUT_MS);

afterAll(async () => {
  if (SKIP) return;
  await client?.end().catch(() => {});
  await container?.stop().catch(() => {});
}, 30_000);

describe.skipIf(SKIP)('@onegrid/postgres — real-database integration', () => {
  it('fetchBlock returns rows from real Postgres', async () => {
    const ds = createPgDataSource({
      client: client!,
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
    expect(res.rows[0]?.id).toBe(1);
    expect(res.rows[9]?.id).toBe(10);
    expect(res.nextCursor).not.toBeNull();
  });

  it('keyset cursor paginates forward correctly across multiple blocks', async () => {
    const ds = createPgDataSource({
      client: client!,
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
      for (const r of res.rows) seen.push(Number(r.id));
      cursor = res.nextCursor;
      if (cursor === null) break;
    }
    // 5 pages × 10 rows = 50 — should be exactly the seeded set.
    expect(seen).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
  });

  it('sort desc by revenue puts the largest first', async () => {
    const ds = createPgDataSource({
      client: client!,
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
    const revenues = res.rows.map((r) => Number(r.revenue));
    for (let i = 1; i < revenues.length; i++) {
      expect(revenues[i]).toBeLessThanOrEqual(revenues[i - 1]!);
    }
  });

  it('filter narrows results to matching rows', async () => {
    const ds = createPgDataSource({
      client: client!,
      table: TABLE_DESC,
      schema: TABLE_SCHEMA,
    });
    const res = await ds.fetchBlock({
      cursor: null,
      direction: 'after',
      limit: 100,
      sort: [{ columnId: 'id', direction: 'asc' }],
      filter: {
        type: 'comparison',
        columnId: 'status',
        op: 'eq',
        value: 'active',
      },
    });
    expect(res.rows.length).toBeGreaterThan(0);
    expect(res.rows.length).toBeLessThan(50);
    for (const r of res.rows) {
      expect(r.status).toBe('active');
    }
  });

  it('unknown column in a filter is rejected at SQL compile time (no SQL injection)', async () => {
    // The compiler whitelists every column referenced in a filter
    // against `table.columns`. A SQL-injection attempt via a
    // crafted columnId must throw rather than reach the SQL string.
    const ds = createPgDataSource({
      client: client!,
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
          columnId: 'evil"; DROP TABLE orders; --',
          op: 'eq',
          value: 'x',
        },
      }),
    ).rejects.toThrow(/unknown column/);

    // Table is still intact after the rejected attempt.
    const check = await client!.query('SELECT count(*)::int AS n FROM public.orders');
    expect(check.rows[0]?.n).toBe(50);
  });

  it('schema() returns the static schema without hitting the database', async () => {
    const ds = createPgDataSource({
      client: client!,
      table: TABLE_DESC,
      schema: TABLE_SCHEMA,
    });
    expect(await ds.schema()).toEqual(TABLE_SCHEMA);
  });
});
