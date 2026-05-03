// =============================================================================
// @onegrid/drizzle
//
// Drizzle ORM adapter for oneGrid SSRM. Translates a BlockRequest (cursor +
// sort + filter + grouping) into Drizzle queries against Postgres, MySQL,
// or SQLite. Pairs with @onegrid/ssrm to plug a Drizzle-backed datasource
// directly into the grid.
//
// Public API surface (planned). Implementations TODO.
// =============================================================================

import type { DataSource } from '@onegrid/protocol';

export interface DrizzleDataSourceOptions {
  /** Drizzle database client instance (drizzle-orm/<driver>). */
  readonly db: unknown;
  /** Drizzle table reference. */
  readonly table: unknown;
  /** Default page size when the client doesn't specify limit. */
  readonly defaultLimit?: number;
}

export const createDrizzleDataSource = (_options: DrizzleDataSourceOptions): DataSource => {
  throw new Error('@onegrid/drizzle: createDrizzleDataSource is not implemented yet.');
};
