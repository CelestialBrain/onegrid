// =============================================================================
// @onegrid/duckdb-join — unit tests for the source-registration SQL
// generation. Full DuckDB-WASM integration runs in real Chromium via
// apps/benchmarks (out of scope for this unit suite — a real AsyncDuckDB
// + Worker bootstrap takes 1+ second of cold startup).
// =============================================================================

import { describe, it, expect, vi } from 'vitest';
import { registerSource, executeJoinQuery, type JoinSource } from '../index.js';

interface MockDb {
  readonly connect: () => Promise<MockConn>;
  readonly registerFileBuffer: (name: string, bytes: Uint8Array) => Promise<void>;
}
interface MockConn {
  readonly query: (sql: string) => Promise<MockResult>;
  readonly close: () => Promise<void>;
}
interface MockResult {
  readonly toArray: () => ReadonlyArray<Record<string, unknown>>;
  readonly schema: { fields: ReadonlyArray<{ name: string }> };
}

function makeMockDb(queryHandler?: (sql: string) => MockResult): {
  db: MockDb;
  queries: string[];
  fileBuffers: Array<{ name: string; bytes: Uint8Array }>;
} {
  const queries: string[] = [];
  const fileBuffers: Array<{ name: string; bytes: Uint8Array }> = [];
  const conn: MockConn = {
    query: vi.fn(async (sql: string) => {
      queries.push(sql);
      return queryHandler ? queryHandler(sql) : {
        toArray: () => [],
        schema: { fields: [] },
      };
    }),
    close: vi.fn(async () => {}),
  };
  const db: MockDb = {
    connect: async () => conn,
    registerFileBuffer: vi.fn(async (name: string, bytes: Uint8Array) => {
      fileBuffers.push({ name, bytes });
    }),
  };
  return { db, queries, fileBuffers };
}

describe('registerSource', () => {
  it('emits a VALUES-based CREATE VIEW for rows source', async () => {
    const { db, queries } = makeMockDb();
    const source: JoinSource = {
      kind: 'rows',
      name: 'orders',
      rows: [
        { id: 1, total: 100 },
        { id: 2, total: 250.5 },
      ],
    };
    await registerSource(db as never, source);
    expect(queries[0]).toMatch(/CREATE OR REPLACE VIEW "orders" AS/);
    expect(queries[0]).toContain('VALUES (1, 100), (2, 250.5)');
    expect(queries[0]).toContain('t("id", "total")');
  });

  it('emits a SELECT NULL WHERE FALSE empty view for zero rows', async () => {
    const { db, queries } = makeMockDb();
    await registerSource(db as never, {
      kind: 'rows',
      name: 'empty_t',
      rows: [],
    });
    expect(queries[0]).toContain('SELECT NULL WHERE FALSE');
  });

  it('escapes string literals with doubled single-quotes', async () => {
    const { db, queries } = makeMockDb();
    await registerSource(db as never, {
      kind: 'rows',
      name: 't',
      rows: [{ note: "it's fine" }],
    });
    expect(queries[0]).toContain("'it''s fine'");
  });

  it('handles null / undefined / NaN as NULL', async () => {
    const { db, queries } = makeMockDb();
    await registerSource(db as never, {
      kind: 'rows',
      name: 't',
      rows: [{ a: null, b: undefined, c: NaN }],
    });
    // VALUES (NULL, NULL, NULL)
    expect(queries[0]).toMatch(/VALUES \(NULL, NULL, NULL\)/);
  });

  it('emits Date as TIMESTAMP literal', async () => {
    const { db, queries } = makeMockDb();
    const d = new Date('2026-05-16T00:00:00Z');
    await registerSource(db as never, {
      kind: 'rows',
      name: 't',
      rows: [{ at: d }],
    });
    expect(queries[0]).toContain("TIMESTAMP '2026-05-16T00:00:00.000Z'");
  });

  it('wraps a sql source body in CREATE OR REPLACE VIEW', async () => {
    const { db, queries } = makeMockDb();
    await registerSource(db as never, {
      kind: 'sql',
      name: 'high_value',
      query: 'SELECT * FROM orders WHERE total > 100',
    });
    expect(queries[0]).toBe(
      'CREATE OR REPLACE VIEW "high_value" AS SELECT * FROM orders WHERE total > 100',
    );
  });

  it('registers arrow bytes via registerFileBuffer + read_arrow view', async () => {
    const { db, queries, fileBuffers } = makeMockDb();
    const bytes = new Uint8Array([1, 2, 3]);
    await registerSource(db as never, {
      kind: 'arrow',
      name: 'shipments',
      bytes,
    });
    expect(fileBuffers).toHaveLength(1);
    expect(fileBuffers[0]?.name).toBe('__og_join_shipments.arrow');
    expect(queries[0]).toContain(
      "read_arrow('__og_join_shipments.arrow')",
    );
  });
});

describe('executeJoinQuery', () => {
  it('registers, queries, returns rows + columns + elapsedMs', async () => {
    const { db, queries } = makeMockDb((sql) => {
      if (/^SELECT/i.test(sql)) {
        return {
          toArray: () => [
            { id: 1, total: 100, name: 'Alpha' },
            { id: 2, total: 250.5, name: 'Beta' },
          ],
          schema: { fields: [{ name: 'id' }, { name: 'total' }, { name: 'name' }] },
        };
      }
      return { toArray: () => [], schema: { fields: [] } };
    });
    const result = await executeJoinQuery({
      db: db as never,
      sources: [
        { kind: 'rows', name: 'o', rows: [{ id: 1, customer_id: 9 }] },
        { kind: 'rows', name: 'c', rows: [{ id: 9, name: 'Alpha' }] },
      ],
      query: 'SELECT o.id, o.customer_id, c.name FROM o JOIN c ON o.customer_id = c.id',
    });
    expect(result.rows).toHaveLength(2);
    expect(result.columns).toEqual(['id', 'total', 'name']);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    // Should have registered both sources + run the query + dropped them.
    expect(queries.filter((q) => q.startsWith('CREATE OR REPLACE VIEW'))).toHaveLength(2);
    expect(queries.filter((q) => q.startsWith('DROP VIEW'))).toHaveLength(2);
  });
});
