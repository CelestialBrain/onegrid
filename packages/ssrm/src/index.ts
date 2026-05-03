// =============================================================================
// @onegrid/ssrm
//
// Server-side row model. Cursor-paged block fetcher with sliding-window LRU
// cache, schema memoization, fingerprint-based invalidation on sort/filter
// /group/pivot changes, and AbortController-aware request cancellation.
// Includes a default WebSocket transport.
//
// Public surface:
//   - createSsrmDataSource(transport, options?) → DataSource (+ invalidate, stats)
//   - createWebSocketTransport({ url, ... }) → SsrmTransport
//   - BlockCache (advanced consumers building custom datasources)
//   - fingerprintQuery (advanced consumers building cache-aware tooling)
//
// =============================================================================

export { BlockCache } from './cache';
export type { BlockCacheOptions } from './cache';

export { fingerprintQuery } from './fingerprint';

export { createSsrmDataSource } from './datasource';
export type { SsrmDataSourceHandle } from './datasource';

export type { SsrmCacheOptions, SsrmTransport } from './types';

export { createWebSocketTransport } from './transports';
export type { WebSocketTransportOptions } from './transports';
