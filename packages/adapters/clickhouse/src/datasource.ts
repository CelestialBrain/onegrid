// =============================================================================
// ClickHouse-backed SsrmDataSource.
//
// Wraps a ClickHouse-compatible queryable and translates BlockRequest
// into native parameterized SQL via `compileBlockQuery`. Supports
// both JSON-flat and Arrow-IPC response paths so callers can pick
// per-deployment — Arrow IPC is the high-throughput path (zero-copy
// columnar) for big tables; JSON is fine for casual use.
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
  type ChTableDescriptor,
} from './sql';

export type ChQueryFormat = 'JSONEachRow' | 'Arrow';

export interface ChQueryRequest {
  readonly sql: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly format: ChQueryFormat;
}

export interface ChQueryResultJson {
  readonly format: 'JSONEachRow';
  readonly rows: ReadonlyArray<Record<string, unknown>>;
}

export interface ChQueryResultArrow {
  readonly format: 'Arrow';
  readonly bytes: Uint8Array;
}

export type ChQueryResult = ChQueryResultJson | ChQueryResultArrow;

/** ClickHouse client interface. The official `@clickhouse/client`
 *  is one option; consumers can also adapt their own HTTP wrapper.
 *  The contract: send SQL + named params + a format hint, get
 *  either rows (JSONEachRow) or bytes (Arrow IPC). */
export interface ChQueryable {
  query(req: ChQueryRequest): Promise<ChQueryResult>;
}

export interface ChDataSourceOptions {
  readonly client: ChQueryable;
  readonly table: ChTableDescriptor;
  readonly schema: Schema;
  /** Preferred response format. Default 'JSONEachRow'. Arrow IPC
   *  reduces wire size + parse cost dramatically for wide tables;
   *  the consumer's row source must have `decodeArrowIpc` configured
   *  to materialize rows from the resulting bytes. */
  readonly format?: ChQueryFormat;
}

export function createChDataSource(opts: ChDataSourceOptions): DataSource {
  const { client, table, schema } = opts;
  const format = opts.format ?? 'JSONEachRow';
  return {
    schema: () => schema,
    async fetchBlock(req: BlockRequest): Promise<BlockResponse> {
      const cursor = parseCursor(req.cursor);
      const { sql, params } = compileBlockQuery(req, table, cursor);
      const result = await client.query({ sql, params, format });
      if (result.format === 'Arrow') {
        // Arrow IPC: cursors / totalRowCount are NOT in the body
        // (binary); we pass the bytes through and let the consumer's
        // ArrowDecoder materialize. Cursors derived from Arrow rows
        // require a decode step on the client; for v0.0.8 we hand
        // back null cursors, leaving keyset pagination over Arrow
        // as a v0.0.9 follow-up. JSON-flat consumers get cursors
        // immediately.
        return {
          encoding: 'arrow-ipc',
          rows: result.bytes,
          nextCursor: null,
          prevCursor: null,
        } as BlockResponse<'arrow-ipc'>;
      }
      const rows = result.rows;
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
      `@onegrid/clickhouse: primary key "${primaryKey}" produced ${typeof rawId}; expected string, number, or bigint.`,
    );
  }
  return { sortValues, rowId: rawId };
}
