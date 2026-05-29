// =============================================================================
// @onegrid/mongo — REAL-database integration tests via testcontainers.
//
// Spins up MongoDB in a container, seeds a small collection, and
// drives BlockRequest through the real driver's Collection. Mongo's
// `MongoCollection.find(filter, {sort, projection, limit}).toArray()`
// shape is structurally compatible with this adapter's interface.
// =============================================================================

import { existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoClient, type Collection, type Db } from 'mongodb';
import { MongoDBContainer, type StartedMongoDBContainer } from '@testcontainers/mongodb';
import { createMongoDataSource } from '../datasource';
import type { BlockRequest, Schema } from '@onegrid/protocol';
import type { MongoCollectionDescriptor } from '../query';

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

const DESC: MongoCollectionDescriptor = {
  collection: 'orders',
  fields: ['id', 'name', 'revenue', 'status'],
  primaryKey: 'id',
};

let container: StartedMongoDBContainer | null = null;
let client: MongoClient | null = null;
let db: Db | null = null;
let coll: Collection | null = null;

beforeAll(async () => {
  if (SKIP) return;
  container = await new MongoDBContainer('mongo:7.0').start();
  client = new MongoClient(container.getConnectionString(), { directConnection: true });
  await client.connect();
  db = client.db('onegrid_test');
  coll = db.collection('orders');
  const statuses = ['active', 'pending', 'churned', 'pilot', 'archived'];
  const docs: Array<Record<string, unknown>> = [];
  for (let i = 1; i <= 50; i++) {
    docs.push({
      id: i,
      name: `name_${i}`,
      revenue: ((i * 1009) % 10_000) / 100,
      status: statuses[i % statuses.length],
    });
  }
  await coll.insertMany(docs);
}, CONTAINER_START_TIMEOUT_MS);

afterAll(async () => {
  if (SKIP) return;
  await client?.close().catch(() => {});
  await container?.stop().catch(() => {});
}, 30_000);

describe.skipIf(SKIP)('@onegrid/mongo — real-database integration', () => {
  it('fetchBlock returns rows from real MongoDB', async () => {
    const ds = createMongoDataSource({ collection: coll as any, descriptor: DESC, schema: TABLE_SCHEMA });
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
    const ds = createMongoDataSource({ collection: coll as any, descriptor: DESC, schema: TABLE_SCHEMA });
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
    const ds = createMongoDataSource({ collection: coll as any, descriptor: DESC, schema: TABLE_SCHEMA });
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
    const ds = createMongoDataSource({ collection: coll as any, descriptor: DESC, schema: TABLE_SCHEMA });
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

  it('unknown field in a filter is rejected before hitting the database', async () => {
    const ds = createMongoDataSource({ collection: coll as any, descriptor: DESC, schema: TABLE_SCHEMA });
    await expect(
      ds.fetchBlock({
        cursor: null,
        direction: 'after',
        limit: 5,
        sort: [{ columnId: 'id', direction: 'asc' }],
        filter: {
          type: 'comparison',
          columnId: '$where; db.orders.drop()',
          op: 'eq',
          value: 'x',
        },
      }),
    ).rejects.toThrow(/unknown field/);
    const n = await coll!.countDocuments({});
    expect(n).toBe(50);
  });

  it('schema() returns the static schema without hitting the database', async () => {
    const ds = createMongoDataSource({ collection: coll as any, descriptor: DESC, schema: TABLE_SCHEMA });
    expect(await ds.schema()).toEqual(TABLE_SCHEMA);
  });
});
