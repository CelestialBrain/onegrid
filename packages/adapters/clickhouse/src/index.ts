// =============================================================================
// @onegrid/clickhouse
//
// ClickHouse adapter for oneGrid SSRM. Translates BlockRequest into
// native parameterized SQL (`{p0:Type}` named placeholders) and
// supports both JSONEachRow and Arrow IPC response formats — Arrow
// IPC is the high-throughput columnar path for wide tables.
//
// No peer dep — the consumer adapts whichever HTTP client they use
// (@clickhouse/client, custom fetch wrapper, etc.) to the
// `ChQueryable` shape.
//
// CDC: ClickHouse doesn't fit the row-diff model — it's append-
// mostly + ReplacingMergeTree for updates. CDC against ClickHouse
// usually means materialized views, kafka engine tables, or
// upstream Debezium → ClickHouse. This adapter ships the data
// source path only; row-diff streaming is out of scope.
// =============================================================================

export { createChDataSource } from './datasource';
export type {
  ChDataSourceOptions,
  ChQueryable,
  ChQueryRequest,
  ChQueryResult,
  ChQueryResultArrow,
  ChQueryResultJson,
  ChQueryFormat,
} from './datasource';

export {
  compileBlockQuery,
  encodeKeysetCursor,
  decodeKeysetCursor,
  isKeysetCursor,
  isLegacyOffsetCursor,
} from './sql';
export type { CompiledQuery, ChTableDescriptor } from './sql';
