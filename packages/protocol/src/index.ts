// =============================================================================
// @onegrid/protocol
//
// Wire-format and database-adapter contract types for oneGrid. Pure types —
// no runtime code. Every oneGrid package consumes only these symbols when
// crossing the network or adapter boundary.
//
// Stability: this is the load-bearing schema. Breaking changes here force
// every downstream package and every adapter to bump versions. Treat it as
// frozen once v0.1.0 ships.
// =============================================================================

// -----------------------------------------------------------------------------
// Versioning
// -----------------------------------------------------------------------------

export const PROTOCOL_VERSION = '0.0.1' as const;
export type ProtocolVersion = typeof PROTOCOL_VERSION;

// -----------------------------------------------------------------------------
// Cursors
// -----------------------------------------------------------------------------

/**
 * Opaque cursor. The server defines its own format and bytes; the client only
 * ever round-trips the string back. This is the canonical cursor shape — keep
 * clients ignorant of internal encoding.
 *
 * The canonical wire encoding is the keyset cursor produced by
 * `encodeKeysetCursor` in `@onegrid/ssrm`, which prefixes the payload with
 * `ks:` so future cursor formats can ship behind a different prefix without
 * breaking existing clients. The legacy `offset:N` encoding (used by
 * `SsrmRowSource`'s synchronous random-access bridge and the v0.0.7 mock
 * server) is supported during the v0.0.8 migration window via
 * `parseLegacyOffsetCursor`; new database adapters should NOT emit it.
 */
export type Cursor = string;

/**
 * Structured cursor shape for keyset pagination. Adapters MUST encode this as
 * an opaque string via `encodeKeysetCursor` from `@onegrid/ssrm` before
 * sending it across the wire — that codec produces the canonical `ks:`-
 * prefixed format described above.
 *
 * Keyset semantics: (sortValues, rowId) uniquely identifies a position in the
 * current sorted view. The tiebreaker rowId guarantees a stable resume point
 * across volatile data — without it, two rows whose sort values tie would
 * collide and clients would skip or duplicate rows when paginating across an
 * insertion or deletion.
 */
export interface KeysetCursor {
  readonly sortValues: ReadonlyArray<unknown>;
  readonly rowId: string | number;
}

// -----------------------------------------------------------------------------
// Sort
// -----------------------------------------------------------------------------

export type SortDirection = 'asc' | 'desc';

export type SortNullHandling = 'first' | 'last';

export interface SortField {
  readonly columnId: string;
  readonly direction: SortDirection;
  /** How to order nulls; default 'last'. */
  readonly nulls?: SortNullHandling;
}

/** Multi-column sort, ordered by priority (leftmost = highest priority). */
export type SortModel = ReadonlyArray<SortField>;

// -----------------------------------------------------------------------------
// Filters
// -----------------------------------------------------------------------------

export type ComparisonOperator =
  | 'eq'
  | 'neq'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'in'
  | 'notIn'
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  | 'isNull'
  | 'isNotNull'
  | 'between'
  | 'notBetween';

export interface ComparisonFilter {
  readonly type: 'comparison';
  readonly columnId: string;
  readonly op: ComparisonOperator;
  /** Used for unary scalar ops (eq, neq, lt, …). */
  readonly value?: unknown;
  /** Used for in/notIn/between/notBetween. */
  readonly values?: ReadonlyArray<unknown>;
  /** String ops only; default false. */
  readonly caseSensitive?: boolean;
}

export interface LogicalFilter {
  readonly type: 'logical';
  readonly op: 'and' | 'or' | 'not';
  readonly filters: ReadonlyArray<FilterNode>;
}

export type FilterNode = ComparisonFilter | LogicalFilter;

/** Null = no filter applied. */
export type FilterModel = FilterNode | null;

// -----------------------------------------------------------------------------
// Grouping
// -----------------------------------------------------------------------------

export interface GroupingModel {
  /** Columns to group by, in nesting order (outer → inner). */
  readonly columns: ReadonlyArray<string>;
  /** Currently expanded group keys. Empty = collapsed top level only. */
  readonly openKeys: ReadonlyArray<ReadonlyArray<unknown>>;
}

// -----------------------------------------------------------------------------
// Aggregation
// -----------------------------------------------------------------------------

export type AggregationType =
  | 'sum'
  | 'avg'
  | 'count'
  | 'countDistinct'
  | 'min'
  | 'max'
  | 'first'
  | 'last';

export interface Aggregation {
  readonly columnId: string;
  /** Built-in type or a string key registered as a custom aggregator. */
  readonly fn: AggregationType | (string & {});
  readonly alias?: string;
}

export type AggregationModel = ReadonlyArray<Aggregation>;

// -----------------------------------------------------------------------------
// Pivot
// -----------------------------------------------------------------------------

export interface PivotModel {
  readonly rows: ReadonlyArray<string>;
  readonly columns: ReadonlyArray<string>;
  readonly measures: AggregationModel;
}

// -----------------------------------------------------------------------------
// Schema
// -----------------------------------------------------------------------------

export type ColumnType =
  | 'int8'
  | 'int16'
  | 'int32'
  | 'int64'
  | 'uint8'
  | 'uint16'
  | 'uint32'
  | 'uint64'
  | 'float32'
  | 'float64'
  | 'decimal'
  | 'utf8'
  | 'binary'
  | 'bool'
  | 'date32'
  | 'date64'
  | 'timestamp'
  | 'timestamp_tz'
  | 'time32'
  | 'time64'
  | 'list'
  | 'struct'
  | 'map'
  | 'json'
  | 'unknown';

export interface ColumnSchema {
  readonly id: string;
  readonly type: ColumnType;
  readonly nullable?: boolean;
  readonly displayName?: string;
  /** For decimal types. */
  readonly precision?: number;
  readonly scale?: number;
  /** For timestamp_tz: IANA timezone string. */
  readonly timezone?: string;
  /** Child fields for list/struct/map. */
  readonly children?: ReadonlyArray<ColumnSchema>;
}

export type Schema = ReadonlyArray<ColumnSchema>;

// -----------------------------------------------------------------------------
// SSRM block fetch (the central contract)
// -----------------------------------------------------------------------------

export type FetchDirection = 'after' | 'before';

export interface BlockRequest {
  /** Null = first block. Server-defined opaque string otherwise. */
  readonly cursor: Cursor | null;
  readonly direction: FetchDirection;
  /** Maximum rows to return. Server may return fewer. */
  readonly limit: number;
  readonly sort: SortModel;
  readonly filter: FilterModel;
  readonly grouping?: GroupingModel;
  /**
   * Aggregations to compute per group when `grouping` is set. The server
   * SHOULD pushdown the rollup (`SUM`/`AVG`/`COUNT`/etc.) so it can return
   * one row per distinct group key combination instead of every raw row in
   * the group — that's the entire point of pushdown.
   *
   * Aliases name the output columns: each `Aggregation`'s `alias` (defaulting
   * to `${fn}_${columnId}` when omitted) becomes a key on every grouped
   * response row alongside the group-key columns. Without `grouping`,
   * `aggregations` is ignored; the server returns flat rows.
   *
   * Example request: group by `status`, compute `sum(revenue)` and
   * `avg(score)`. Response rows look like
   * `{ status: 'active', sum_revenue: 9.99e9, avg_score: 49.5, __count__: 200000 }`.
   * The `__count__` field carries the per-group row count so the client can
   * render the group header chevron + count without a second round-trip.
   */
  readonly aggregations?: AggregationModel;
  readonly pivot?: PivotModel;
  /** Subset of columns the client wants materialised. Server may return more. */
  readonly columns?: ReadonlyArray<string>;
  /** Per-block correlation id; server should echo for telemetry/cancel. */
  readonly requestId?: string;
  /**
   * Hierarchical (tree) fetch. Null/undefined = root level. When set, the
   * server returns the children of the named parent node, paginated by
   * cursor / limit. Distinct `parentId`s use independent cursor spaces:
   * a cursor returned for parent A is NOT valid against parent B.
   *
   * Cache fingerprint includes `parentId` so blocks fetched under one
   * parent never collide with blocks fetched under another.
   */
  readonly parentId?: string | null;
}

/**
 * Per-row hierarchy metadata for tree responses. Indexed parallel to
 * `BlockResponse.rows`. Servers populate this on hierarchical fetches
 * (where `BlockRequest.parentId` semantics are in play); flat responses
 * may omit it.
 */
export interface HierarchyEntry {
  /** Stable node id; passed back as `parentId` to fetch this node's children. */
  readonly id: string;
  /** Whether this node has children that can be expanded. */
  readonly hasChildren: boolean;
}

/**
 * Wire encoding for row data. Arrow IPC is canonical (zero-copy on the client);
 * JSON is the fallback for non-binary transports and debugging.
 */
export type RowEncoding = 'arrow-ipc' | 'json';

export type EncodedRows<TEncoding extends RowEncoding> = TEncoding extends 'arrow-ipc'
  ? Uint8Array
  : ReadonlyArray<Record<string, unknown>>;

export interface BlockResponse<TEncoding extends RowEncoding = RowEncoding> {
  readonly encoding: TEncoding;
  readonly rows: EncodedRows<TEncoding>;
  /** Cursor to fetch the block AFTER the last row in `rows`; null = end. */
  readonly nextCursor: Cursor | null;
  /** Cursor to fetch the block BEFORE the first row in `rows`; null = start. */
  readonly prevCursor: Cursor | null;
  /**
   * Total row count if cheap to compute. Omit for ∞-scroll semantics; clients
   * that need scrollbars fall back to estimated heights.
   */
  readonly totalRowCount?: number;
  readonly requestId?: string;
  /**
   * Per-row hierarchy info, parallel to `rows`. Present on hierarchical
   * fetches (where the request carried `parentId`); absent on flat fetches.
   * Clients MUST tolerate missing entries — e.g. a server that doesn't
   * support trees just leaves this undefined.
   */
  readonly hierarchy?: ReadonlyArray<HierarchyEntry>;
}

// -----------------------------------------------------------------------------
// DataSource interface
// -----------------------------------------------------------------------------

export interface FetchOptions {
  /** Cancel in-flight requests on scroll/filter change. */
  readonly signal?: AbortSignal;
}

export type Unsubscribe = () => void;

export interface DataSource {
  /** Schema is required up-front; the grid binds columns to fields. */
  readonly schema: () => Promise<Schema> | Schema;
  /** Server-side row model fetch — the central contract. */
  readonly fetchBlock: (req: BlockRequest, opts?: FetchOptions) => Promise<BlockResponse>;
  /** Optional live update stream. Adapters without push leave this undefined. */
  readonly subscribe?: (onPatch: (patch: Patch) => void, opts?: FetchOptions) => Unsubscribe;
  /** Optional write-back. Adapters may be read-only. */
  readonly mutate?: (
    mutations: ReadonlyArray<Mutation>,
    opts?: FetchOptions,
  ) => Promise<MutationResult>;
}

// -----------------------------------------------------------------------------
// Mutations
// -----------------------------------------------------------------------------

export type MutationKind = 'insert' | 'update' | 'delete';

export interface InsertMutation {
  readonly kind: 'insert';
  /** Client-generated id; server echoes back in MutationResult for reconciliation. */
  readonly clientId: string;
  readonly row: Record<string, unknown>;
}

export interface UpdateMutation {
  readonly kind: 'update';
  readonly clientId: string;
  readonly rowId: string | number;
  readonly fields: Record<string, unknown>;
  /** Optional optimistic-concurrency check: previous values seen by client. */
  readonly expected?: Record<string, unknown>;
}

export interface DeleteMutation {
  readonly kind: 'delete';
  readonly clientId: string;
  readonly rowId: string | number;
}

export type Mutation = InsertMutation | UpdateMutation | DeleteMutation;

export interface MutationOk {
  readonly kind: 'ok';
  readonly clientId: string;
  readonly rowId: string | number;
}

export interface MutationConflict {
  readonly kind: 'conflict';
  readonly clientId: string;
  readonly rowId: string | number;
  readonly server: Record<string, unknown>;
}

export interface MutationError {
  readonly kind: 'error';
  readonly clientId: string;
  readonly message: string;
  readonly code?: string;
}

export type MutationResultEntry = MutationOk | MutationConflict | MutationError;

export type MutationResult = ReadonlyArray<MutationResultEntry>;

// -----------------------------------------------------------------------------
// Patches (live updates)
// -----------------------------------------------------------------------------

export interface RowInsertPatch {
  readonly kind: 'rowInsert';
  /** Position to insert after. Null = append. */
  readonly afterCursor: Cursor | null;
  readonly rows: ReadonlyArray<Record<string, unknown>>;
}

export interface RowUpdatePatch {
  readonly kind: 'rowUpdate';
  readonly rowId: string | number;
  readonly fields: Record<string, unknown>;
}

export interface RowDeletePatch {
  readonly kind: 'rowDelete';
  readonly rowId: string | number;
}

export interface SchemaPatch {
  readonly kind: 'schema';
  readonly schema: Schema;
}

export interface InvalidatePatch {
  readonly kind: 'invalidate';
  /** Null = invalidate entire cache. */
  readonly scope: { columnId: string } | null;
}

export type Patch =
  | RowInsertPatch
  | RowUpdatePatch
  | RowDeletePatch
  | SchemaPatch
  | InvalidatePatch;

// -----------------------------------------------------------------------------
// Real-time row-diff stream
// -----------------------------------------------------------------------------

/**
 * Single versioned row-diff event. Servers emit one for every
 * insert / update / delete on any row a client could have cached.
 * `version` is monotonically increasing per source — a client tracks
 * the last seen value to detect a gap (e.g. after a WebSocket
 * reconnect) and trigger a resync request.
 *
 * Wire shape is deliberately flat (no nested `patch`) so the
 * envelope cost is minimal — high-throughput change streams may emit
 * thousands of these per second.
 */
export interface RowDiff {
  readonly kind: 'insert' | 'update' | 'delete';
  /** Monotonic per-source counter. Strictly increasing across emits. */
  readonly version: number;
  /** Primary key value identifying the row across its lifecycle. */
  readonly pkey: string | number;
  /** Cell values for insert / update; omitted for delete. Servers
   *  MAY send a partial map for update (only changed fields) — the
   *  client's reconciliation policy decides whether to merge against
   *  cached state or refetch the row. */
  readonly fields?: Record<string, unknown>;
}

/**
 * Client → server: replay row-diffs from `fromVersion` (exclusive)
 * onwards. Sent when the client detects a version gap (last seen
 * version + 1 ≠ next received version) or after a transport
 * reconnect.
 */
export interface ResyncRequest {
  readonly fromVersion: number;
}

/**
 * Server → client response to a `ResyncRequest`. When the gap is
 * small enough to replay (`diffs` populated, `snapshot` absent),
 * the client merges them in version order. When the gap is too
 * large to keep history for (`snapshot: true`), the client MUST
 * drop its cache and re-fetch from scratch — the server is telling
 * it that a coherent replay isn't possible.
 */
export interface ResyncResponse {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly diffs: ReadonlyArray<RowDiff>;
  /** When true, the client should treat its cache as invalid and
   *  re-issue the original `BlockRequest`s from scratch. `diffs` is
   *  empty in this case. */
  readonly snapshot?: true;
}

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

export type ProtocolErrorCode =
  | 'INVALID_CURSOR'
  | 'INVALID_FILTER'
  | 'INVALID_SORT'
  | 'INVALID_SCHEMA'
  | 'UNSUPPORTED'
  | 'TIMEOUT'
  | 'CANCELED'
  | 'INTERNAL';

export interface ProtocolError {
  readonly code: ProtocolErrorCode;
  readonly message: string;
  readonly cause?: unknown;
}
