// =============================================================================
// @onegrid/sqlite
//
// SQLite adapter for oneGrid SSRM. Translates BlockRequest into
// parameterized SQL via a pure compiler. Targets every popular
// SQLite driver — better-sqlite3, node:sqlite (Node 22+),
// bun:sqlite, Cloudflare D1, libsql/Turso — through a small
// queryable interface the caller adapts.
//
// CDC: SQLite has no LISTEN/NOTIFY-style pubsub. Production
// consumers wire a polling-based outbox the same way the MySQL
// adapter does (see @onegrid/mysql for a reference); this package
// stays minimal at v0.0.8 since SQLite-backed grids are typically
// single-writer (no need for CDC).
// =============================================================================

export { createSqliteDataSource } from './datasource';
export type {
  SqliteDataSourceOptions,
  SqliteQueryable,
} from './datasource';

export {
  compileBlockQuery,
  encodeKeysetCursor,
  decodeKeysetCursor,
  isKeysetCursor,
  isLegacyOffsetCursor,
} from './sql';
export type { CompiledQuery, SqliteTableDescriptor } from './sql';
