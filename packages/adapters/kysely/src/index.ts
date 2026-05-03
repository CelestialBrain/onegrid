// =============================================================================
// @onegrid/kysely
//
// Kysely query-builder adapter for oneGrid SSRM. Translates a BlockRequest
// into type-safe SQL via Kysely's expression builder. Works against any
// Kysely-supported dialect (Postgres, MySQL, SQLite, Cloudflare D1, etc.).
//
// Public API surface (planned). Implementations TODO.
// =============================================================================

import type { DataSource } from '@onegrid/protocol';

export interface KyselyDataSourceOptions {
  /** Kysely instance. */
  readonly db: unknown;
  /** Table name to query against. */
  readonly table: string;
  /** Primary-key column for cursor tiebreaking. */
  readonly idColumn: string;
  readonly defaultLimit?: number;
}

export const createKyselyDataSource = (_options: KyselyDataSourceOptions): DataSource => {
  throw new Error('@onegrid/kysely: createKyselyDataSource is not implemented yet.');
};
