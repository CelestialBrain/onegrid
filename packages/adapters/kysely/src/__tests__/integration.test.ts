// =============================================================================
// @onegrid/kysely — REAL-database integration tests via testcontainers.
//
// Kysely is dialect-agnostic; this spec exercises the Postgres dialect.
// The translation layer (BlockRequest → ExpressionBuilder) is the
// same for every dialect kysely supports, so a single-dialect proof
// gives us reasonable end-to-end confidence.
//
// Unknown-column rejection is NOT enforced by this adapter at compile
// time — kysely is structural and the adapter delegates to the engine.
// That gap is itself a finding worth recording (separate from the per-
// SQL-adapter unknown-column whitelist); the test below asserts the
// database rejects the malformed identifier safely rather than that
// the adapter pre-rejects.
// =============================================================================

import { existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Kysely, PostgresDialect } from 'kysely';
import { createKyselyDataSource } from '../index';
import type { BlockRequest, Schema } from '@onegrid/protocol';

interface Database {
  orders: {
    id: number;
    name: string;
    revenue: number;
    status: string;
  };
}

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

const SCHEMA: Schema = [
  { id: 'id', type: 'int32' },
  { id: 'name', type: 'utf8' },
  { id: 'revenue', type: 'float64' },
  { id: 'status', type: 'utf8' },
];

let container: StartedPostgreSqlContainer | null = null;
let pool: Pool | null = null;
let db: Kysely<Database> | null = null;

beforeAll(async () => {
  if (SKIP) return;
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('onegrid_test')
    .withUsername('test')
    .withPassword('test')
    .start();
  pool = new Pool({ connectionString: container.getConnectionUri() });
  await pool.query(`
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
  await pool.query(
    `INSERT INTO orders (id, name, revenue, status) VALUES ${values.join(', ')}`,
    params,
  );
  db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}, CONTAINER_START_TIMEOUT_MS);

afterAll(async () => {
  if (SKIP) return;
  await db?.destroy().catch(() => {});
  await container?.stop().catch(() => {});
}, 30_000);

describe.skipIf(SKIP)('@onegrid/kysely — real-database integration', () => {
  it('fetchBlock returns rows via kysely against real Postgres', async () => {
    const ds = createKyselyDataSource({
      db: db! as any,
      tableName: 'orders',
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
    const ds = createKyselyDataSource({
      db: db! as any,
      tableName: 'orders',
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
    const ds = createKyselyDataSource({
      db: db! as any,
      tableName: 'orders',
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
    const ds = createKyselyDataSource({
      db: db! as any,
      tableName: 'orders',
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

  it('malformed column id is rejected by Postgres without damaging the table', async () => {
    // Kysely escapes identifiers; the adapter does not pre-whitelist
    // (kysely has no runtime schema reflection). A malformed columnId
    // therefore round-trips to PG and is rejected as an undefined
    // column — proving the parameterization is intact.
    const ds = createKyselyDataSource({
      db: db! as any,
      tableName: 'orders',
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
    ).rejects.toThrow();
    const check = await pool!.query('SELECT count(*)::int AS n FROM orders');
    expect(check.rows[0]?.n).toBe(50);
  });

  it('schema() returns the user-supplied schema', async () => {
    const ds = createKyselyDataSource({
      db: db! as any,
      tableName: 'orders',
      idColumn: 'id',
      schema: SCHEMA,
    });
    expect(await ds.schema()).toEqual(SCHEMA);
  });
});
