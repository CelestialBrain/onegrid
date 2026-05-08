// =============================================================================
// @onegrid/ssrm
//
// Server-side row model. Cursor-paged block fetcher with sliding-window LRU
// cache, schema memoization, fingerprint-based invalidation on sort/filter
// /group/pivot changes, and AbortController-aware request cancellation.
// Ships HTTP and WebSocket transports plus a sync RowSource bridge.
//
// Public surface:
//   - createSsrmDataSource(transport, options?) → DataSource (+ invalidate, stats)
//   - createHttpTransport({ baseUrl, ... }) → SsrmTransport
//   - createWebSocketTransport({ url, ... }) → SsrmTransport
//   - createSsrmRowSource(dataSource, opts) → RowSource w/ block cache + lazy fetch
//   - BlockCache, fingerprintQuery — advanced consumers building cache-aware tooling
//
// =============================================================================

export { BlockCache } from './cache';
export type { BlockCacheOptions } from './cache';

export { fingerprintQuery } from './fingerprint';

export { createSsrmDataSource } from './datasource';
export type { SsrmDataSourceHandle } from './datasource';

export type { SsrmCacheOptions, SsrmTransport } from './types';

export { createWebSocketTransport, createHttpTransport } from './transports';
export type {
  WebSocketTransportOptions,
  HttpTransportOptions,
} from './transports';

export { createSsrmRowSource } from './row-source';
export type {
  RowSource,
  SsrmRowSourceHandle,
  SsrmRowSourceOptions,
} from './row-source';

export { createSsrmTreeSource } from './tree-source';
export type {
  SsrmTreeSourceHandle,
  SsrmTreeSourceOptions,
  SsrmTreeRowMeta,
} from './tree-source';

export {
  encodeKeysetCursor,
  decodeKeysetCursor,
  cursorFromRow,
  compareKeysetCursors,
  isLegacyOffsetCursor,
  parseLegacyOffsetCursor,
} from './cursor';

export { createRowDiffTracker } from './row-diff-tracker';
export type {
  RowDiffTracker,
  RowDiffTrackerOptions,
} from './row-diff-tracker';
