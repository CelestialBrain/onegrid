// =============================================================================
// MongoDB-backed SsrmDataSource.
//
// Wraps a Mongo-compatible collection (typed via a small interface)
// and translates BlockRequest into find / aggregate calls. The
// caller adapts whichever client (mongodb, mongoose underlying
// collection, etc.) to MongoCollection.
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
  type MongoCollectionDescriptor,
} from './query';

/** Minimal Mongo collection interface oneGrid talks to. The official
 *  driver's `Collection` satisfies this. */
export interface MongoCollection {
  find(
    filter: Record<string, unknown>,
    options: { sort: Record<string, 1 | -1>; projection: Record<string, 1>; limit: number },
  ): { toArray(): Promise<ReadonlyArray<Record<string, unknown>>> };
  aggregate(
    pipeline: ReadonlyArray<Record<string, unknown>>,
  ): { toArray(): Promise<ReadonlyArray<Record<string, unknown>>> };
}

export interface MongoDataSourceOptions {
  readonly collection: MongoCollection;
  readonly descriptor: MongoCollectionDescriptor;
  readonly schema: Schema;
}

export function createMongoDataSource(
  opts: MongoDataSourceOptions,
): DataSource {
  const { collection, descriptor, schema } = opts;
  return {
    schema: () => schema,
    async fetchBlock(req: BlockRequest): Promise<BlockResponse> {
      const cursor = parseCursor(req.cursor);
      const compiled = compileBlockQuery(req, descriptor, cursor);
      const rows =
        compiled.kind === 'find'
          ? await collection
              .find(compiled.filter, {
                sort: compiled.sort,
                projection: compiled.projection,
                limit: compiled.limit,
              })
              .toArray()
          : await collection.aggregate(compiled.pipeline).toArray();
      const nextCursor =
        compiled.kind === 'find' && rows.length === req.limit
          ? encodeKeysetCursor(
              cursorFromRow(rows[rows.length - 1]!, req.sort, descriptor.primaryKey),
            )
          : null;
      const prevCursor =
        compiled.kind === 'find' && rows.length > 0 && req.cursor
          ? encodeKeysetCursor(cursorFromRow(rows[0]!, req.sort, descriptor.primaryKey))
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
  // ObjectId / Buffer / etc. are not stable as wire-cursor rowIds —
  // the consumer should pre-stringify in their projection if they
  // want to use a non-primitive primary key (or pass a stable string
  // application-level id as the descriptor's primaryKey).
  if (typeof rawId === 'string' || typeof rawId === 'number') {
    return { sortValues, rowId: rawId };
  }
  if (rawId !== null && rawId !== undefined && typeof (rawId as { toString?: () => string }).toString === 'function') {
    return { sortValues, rowId: (rawId as { toString: () => string }).toString() };
  }
  throw new Error(
    `@onegrid/mongo: primary key "${primaryKey}" produced ${typeof rawId}; expected string, number, or .toString()-able.`,
  );
}
