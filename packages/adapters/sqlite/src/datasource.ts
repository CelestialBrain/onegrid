// =============================================================================
// SQLite-backed SsrmDataSource.
//
// Targets a small queryable interface that all the popular SQLite
// drivers conform to:
//   - better-sqlite3 (sync — wrap with Promise.resolve)
//   - node:sqlite (Node 22+ builtin, sync — same wrap)
//   - bun:sqlite (sync)
//   - Cloudflare D1 (async, native)
//   - libsql / Turso (async)
//
// The caller adapts whichever driver to the SqliteQueryable shape.
// =============================================================================

import type {
  BlockRequest,
  BlockResponse,
  DataSource,
  Schema,
  SortField,
} from '@onegrid/protocol';
import {
  compileBlockQuery,
  decodeKeysetCursor,
  encodeKeysetCursor,
  isKeysetCursor,
  isLegacyOffsetCursor,
  type SqliteTableDescriptor,
} from './sql';

/** Universal SQLite query interface — shape every driver can satisfy. */
export interface SqliteQueryable {
  /** Execute a parameterized query and return rows as plain objects.
   *  Sync drivers can wrap their result in `Promise.resolve(...)`.
   *  The caller is expected to handle column type coercion (esp.
   *  bigint for INTEGER PRIMARY KEY) — bigint values flow straight
   *  through. */
  query(
    sql: string,
    params?: ReadonlyArray<unknown>,
  ):
    | ReadonlyArray<Record<string, unknown>>
    | Promise<ReadonlyArray<Record<string, unknown>>>;
}

export interface SqliteDataSourceOptions {
  readonly client: SqliteQueryable;
  readonly table: SqliteTableDescriptor;
  readonly schema: Schema;
}

export function createSqliteDataSource(
  opts: SqliteDataSourceOptions,
): DataSource {
  const { client, table, schema } = opts;
  return {
    schema: () => schema,
    async fetchBlock(req: BlockRequest): Promise<BlockResponse> {
      const cursor = parseCursor(req.cursor);
      const { sql, params } = compileBlockQuery(req, table, cursor);
      const rows = await Promise.resolve(client.query(sql, params));
      const nextCursor =
        rows.length === req.limit
          ? encodeKeysetCursor(cursorFromRow(rows[rows.length - 1]!, req.sort, table.primaryKey))
          : null;
      const prevCursor =
        rows.length > 0 && req.cursor
          ? encodeKeysetCursor(cursorFromRow(rows[0]!, req.sort, table.primaryKey))
          : null;
      return {
        encoding: 'json',
        rows,
        nextCursor,
        prevCursor,
      };
    },
  };
}

function parseCursor(
  cursor: string | null | undefined,
): ReturnType<typeof decodeKeysetCursor> | null {
  if (cursor === null || cursor === undefined) return null;
  if (isKeysetCursor(cursor) || (!isLegacyOffsetCursor(cursor) && cursor.length > 0)) {
    try {
      return decodeKeysetCursor(cursor);
    } catch {
      return null;
    }
  }
  return null;
}

function cursorFromRow(
  row: Record<string, unknown>,
  sort: ReadonlyArray<SortField>,
  primaryKey: string,
): { sortValues: ReadonlyArray<unknown>; rowId: string | number } {
  const sortValues = sort.map((field) => row[field.columnId] ?? null);
  const rawId = row[primaryKey];
  if (typeof rawId === 'bigint') {
    return { sortValues, rowId: Number(rawId) };
  }
  if (typeof rawId !== 'string' && typeof rawId !== 'number') {
    throw new Error(
      `@onegrid/sqlite: primary key "${primaryKey}" produced ${typeof rawId}; expected string, number, or bigint.`,
    );
  }
  return { sortValues, rowId: rawId };
}
