// =============================================================================
// Data adapters — surface inspection across every database the adapter
// family covers. We don't run live DBs in the browser; we exercise each
// adapter's SQL-compiler public surface against a synthetic BlockRequest.
// =============================================================================

import { useMemo, useState, type JSX } from 'react';
import type { BlockRequest } from '@onegrid/protocol';
import * as pg from '@onegrid/postgres';
import * as mysql from '@onegrid/mysql';
import * as sqlite from '@onegrid/sqlite';
import * as clickhouse from '@onegrid/clickhouse';
import * as mongo from '@onegrid/mongo';
import * as drizzle from '@onegrid/drizzle';
import * as kysely from '@onegrid/kysely';
import * as duckdb from '@onegrid/duckdb';
import * as duckdbJoin from '@onegrid/duckdb-join';
import * as introspect from '@onegrid/introspect';
import * as migrate from '@onegrid/migrate';
import { Btn, Card, Output } from '../ui';

// The same BlockRequest we hand every adapter; each emits its own dialect.
const SAMPLE_REQUEST: BlockRequest = {
  cursor: null,
  direction: 'after',
  limit: 10,
  sort: [
    { columnId: 'revenue', direction: 'desc' },
    { columnId: 'id', direction: 'asc' },
  ],
  filter: {
    type: 'logical',
    op: 'and',
    filters: [
      { type: 'comparison', columnId: 'status', op: 'eq', value: 'active' },
      { type: 'comparison', columnId: 'revenue', op: 'gt', value: 1000 },
    ],
  },
};

const SAMPLE_TABLE = {
  name: 'customers',
  schema: 'public',
  primaryKey: ['id'],
  columns: [
    { id: 'id', type: 'integer' as const },
    { id: 'name', type: 'string' as const },
    { id: 'status', type: 'string' as const },
    { id: 'revenue', type: 'number' as const },
  ],
};

interface AdapterInfo {
  readonly name: string;
  readonly description: string;
  readonly probe: () => string;
  readonly exports: string[];
}

const ADAPTERS: ReadonlyArray<AdapterInfo> = [
  {
    name: '@onegrid/postgres',
    description: 'Raw Postgres adapter: pure SQL compiler + pg-compatible queryable + LISTEN/NOTIFY CDC. Wave-8 milestone.',
    exports: Object.keys(pg).sort(),
    probe: () => {
      try {
        const compileSql = (pg as unknown as { compileSql?: (t: typeof SAMPLE_TABLE, r: BlockRequest) => unknown }).compileSql;
        if (compileSql) return JSON.stringify(compileSql(SAMPLE_TABLE, SAMPLE_REQUEST), null, 2);
        return `[surface only — public exports: ${Object.keys(pg).join(', ')}]`;
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    },
  },
  {
    name: '@onegrid/mysql',
    description: 'MySQL adapter: backticks + ? placeholders + polling-outbox CDC.',
    exports: Object.keys(mysql).sort(),
    probe: () => `[surface only — public exports: ${Object.keys(mysql).join(', ')}]`,
  },
  {
    name: '@onegrid/sqlite',
    description: 'SQLite adapter: works with better-sqlite3, node:sqlite, bun:sqlite, libsql/Turso, Cloudflare D1.',
    exports: Object.keys(sqlite).sort(),
    probe: () => `[surface only — public exports: ${Object.keys(sqlite).join(', ')}]`,
  },
  {
    name: '@onegrid/clickhouse',
    description: 'ClickHouse adapter: native {p0:Type} params + JSONEachRow + Arrow IPC.',
    exports: Object.keys(clickhouse).sort(),
    probe: () => `[surface only — public exports: ${Object.keys(clickhouse).join(', ')}]`,
  },
  {
    name: '@onegrid/mongo',
    description: 'MongoDB adapter: aggregation pipeline + change-streams CDC with resume tokens.',
    exports: Object.keys(mongo).sort(),
    probe: () => `[surface only — public exports: ${Object.keys(mongo).join(', ')}]`,
  },
  {
    name: '@onegrid/drizzle',
    description: 'Drizzle ORM bridge: type-aware schema introspection and rows → BlockResponse.',
    exports: Object.keys(drizzle).sort(),
    probe: () => `[surface only — public exports: ${Object.keys(drizzle).join(', ')}]`,
  },
  {
    name: '@onegrid/kysely',
    description: 'Kysely query-builder bridge.',
    exports: Object.keys(kysely).sort(),
    probe: () => `[surface only — public exports: ${Object.keys(kysely).join(', ')}]`,
  },
  {
    name: '@onegrid/duckdb',
    description: 'DuckDB-WASM in-browser backing engine.',
    exports: Object.keys(duckdb).sort(),
    probe: () => `[surface only — public exports: ${Object.keys(duckdb).join(', ')}]`,
  },
  {
    name: '@onegrid/duckdb-join',
    description: 'Cross-source joins: remote Postgres + local Parquet + CSV joined in-browser. V0.1.0 milestone.',
    exports: Object.keys(duckdbJoin).sort(),
    probe: () => `[surface only — public exports: ${Object.keys(duckdbJoin).join(', ')}]`,
  },
  {
    name: '@onegrid/introspect',
    description: 'Schema introspection helpers: columnsFromSchema, schemaFromSqlRows, etc.',
    exports: Object.keys(introspect).sort(),
    probe: () => `[surface only — public exports: ${Object.keys(introspect).join(', ')}]`,
  },
  {
    name: '@onegrid/migrate',
    description: 'jscodeshift-based migration CLI for adopters moving off other grids.',
    exports: Object.keys(migrate).sort(),
    probe: () => `[surface only — public exports: ${Object.keys(migrate).join(', ')}]`,
  },
];

export function DataAdaptersTab(): JSX.Element {
  const [activeIdx, setActiveIdx] = useState(0);
  const active = ADAPTERS[activeIdx]!;
  const output = useMemo(() => active.probe(), [active]);

  return (
    <div>
      <Card title="Sample BlockRequest">
        <Output>{JSON.stringify(SAMPLE_REQUEST, null, 2)}</Output>
      </Card>

      <Card title="Adapter">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          {ADAPTERS.map((a, i) => (
            <Btn key={a.name} onClick={() => setActiveIdx(i)}>
              <span
                style={{
                  fontWeight: i === activeIdx ? 600 : 400,
                  color: i === activeIdx ? 'var(--accent)' : 'var(--text)',
                }}
              >
                {a.name.replace('@onegrid/', '')}
              </span>
            </Btn>
          ))}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
          <strong style={{ color: 'var(--text)' }}>{active.name}</strong> — {active.description}
        </div>
        <Output>{output}</Output>
      </Card>

      <Card title="Note">
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
          Adapter surfaces are exercised here without a live database. Real
          integration (running Postgres in testcontainers, etc.) lives in
          each adapter's own test suite — see{' '}
          <code>packages/adapters/postgres/src/__tests__/integration.test.ts</code>{' '}
          which spins up Postgres 16 via{' '}
          <code>@testcontainers/postgresql</code>.
        </div>
      </Card>
    </div>
  );
}
