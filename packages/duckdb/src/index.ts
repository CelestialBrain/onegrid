// =============================================================================
// @onegrid/duckdb
//
// Optional plugin: DuckDB-WASM as a client-side query engine and SSRM source.
// Lazy-loaded; consumers add @duckdb/duckdb-wasm as a peer dependency only
// when they need it.
//
// Public API surface (planned). Implementations TODO.
// =============================================================================

import type { DataSource } from '@onegrid/protocol';

export interface DuckDbDataSourceOptions {
  /** Existing AsyncDuckDB instance (recommended for app-controlled lifecycle). */
  readonly db?: unknown;
  /** Source table name or SQL view to query against. */
  readonly source: string;
  /** Optional per-block SQL fragment merged into WHERE clauses. */
  readonly baseFilter?: string;
}

export const createDuckDbDataSource = (_options: DuckDbDataSourceOptions): DataSource => {
  throw new Error('@onegrid/duckdb: createDuckDbDataSource is not implemented yet.');
};
