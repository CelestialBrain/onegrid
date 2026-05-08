// =============================================================================
// MySQL-backed SsrmDataSource. Compiles BlockRequest into parameterized
// SQL via `compileBlockQuery` and executes against a `mysql2`-
// compatible client/pool. The caller owns the connection lifecycle.
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
  type MyTableDescriptor,
} from './sql';

/**
 * Minimal `mysql2`-compatible queryable. Anything that exposes
 * `query(sql, params)` returning `[rows, fields]` is acceptable —
 * `mysql2/promise`'s Connection / Pool both satisfy this.
 */
export interface MyQueryable {
  query(
    sql: string,
    params?: ReadonlyArray<unknown>,
  ): Promise<readonly [ReadonlyArray<Record<string, unknown>>, unknown]>;
}

export interface MyDataSourceOptions {
  readonly client: MyQueryable;
  readonly table: MyTableDescriptor;
  readonly schema: Schema;
}

export function createMyDataSource(opts: MyDataSourceOptions): DataSource {
  const { client, table, schema } = opts;
  return {
    schema: () => schema,
    async fetchBlock(req: BlockRequest): Promise<BlockResponse> {
      const cursor = parseCursor(req.cursor);
      const { sql, params } = compileBlockQuery(req, table, cursor);
      const [rows] = await client.query(sql, params);
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
  if (typeof rawId !== 'string' && typeof rawId !== 'number') {
    throw new Error(
      `@onegrid/mysql: primary key "${primaryKey}" produced ${typeof rawId}; expected string or number.`,
    );
  }
  return { sortValues, rowId: rawId };
}
